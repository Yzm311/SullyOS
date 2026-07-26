const OPENAI_UPSTREAM = 'https://api.openai.com/v1/images/generations';

function setCors(res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function normalizeApiKey(raw?: string): string {
    if (!raw) return '';
    return raw.trim().replace(/^Bearer\s+/i, '').trim();
}

export default async function handler(req: any, res: any) {
    setCors(res);

    // 处理跨域预检OPTIONS请求
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    // 仅允许POST请求
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // 提取API密钥
    const incomingAuth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const envKey = typeof process.env.OPENAI_IMAGE_API_KEY === 'string' ? process.env.OPENAI_IMAGE_API_KEY : '';
    const finalApiKey = normalizeApiKey(incomingAuth) || normalizeApiKey(envKey);

    // 无密钥直接返回报错
    if (!finalApiKey) {
        res.setHeader('Content-Type', 'application/json');
        res.status(400).json({ error: 'Missing API key. Provide Authorization or OPENAI_IMAGE_API_KEY.' });
        return;
    }

    // 组装请求体，填充默认参数
    const requestBody = { ...(req.body || {}) };
    if (!requestBody.model) requestBody.model = 'dall-e-3';
    if (!requestBody.size) requestBody.size = '1024x1024';
    if (!requestBody.n) requestBody.n = 1;

    // 打印入参日志
    console.log('[openai-image:generate] request', {
        model: requestBody.model,
        size: requestBody.size,
        prompt_length: typeof requestBody.prompt === 'string' ? requestBody.prompt.length : 0,
    });

    try {
        // 转发请求至OpenAI上游接口
        const upstream = await fetch(OPENAI_UPSTREAM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${finalApiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        // 上游接口返回异常处理
        if (!upstream.ok) {
            const errText = await upstream.text();
            console.log('[openai-image:generate] error', { status: upstream.status, body: errText.slice(0, 200) });
            res.status(upstream.status);
            res.setHeader('Content-Type', 'application/json');
            res.send(errText);
            return;
        }

        // 正常返回OpenAI生成图片结果
        const data = await upstream.json();
        console.log('[openai-image:generate] success');
        res.status(200).json(data);

    } catch (error: any) {
        // 捕获程序内部异常
        res.status(500).json({ error: error?.message || 'Image generation failed' });
    }
}

/**
 * M2 全链路 CDP 自测脚本（仅开发期使用）。
 * 用法：先以 npm run dev -- --remote-debugging-port=9222 启动应用，再运行本脚本。
 * 前置：环境变量 TOKENRHYTHM_API_KEY 提供密钥（脚本不打印密钥）。
 * 流程：真实 Electron 页面内执行——创建档案 → 流式对话 → 设默认 → 汇总结果。
 */
const KEY = process.env.TOKENRHYTHM_API_KEY
if (!KEY) {
  console.error('缺少环境变量 TOKENRHYTHM_API_KEY')
  process.exit(1)
}

const BASE = 'https://tokenrhythm.studio/v1'
const MODEL = 'deepseek-v4-flash'

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost'))
  if (!page) throw new Error('未找到应用页面: ' + JSON.stringify(targets.map((t) => t.url)))

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('CDP WebSocket 连接失败'))
  })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(msg.error.message))
      else res(msg.result)
    }
  }
  const send = (method, params) =>
    new Promise((res, rej) => {
      const id = ++seq
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params }))
    })

  // 在应用页面里执行完整链路（key 经 JSON 注入，不落日志）
  const expression = `(async () => {
    const key = ${JSON.stringify(KEY)}
    const create = await window.api.apiProfiles.create({
      name: '基元律动（ZCode 同款）',
      providerKind: 'openai-compatible',
      baseUrl: ${JSON.stringify(BASE)},
      apiKey: key,
      model: ${JSON.stringify(MODEL)},
      params: {}
    })
    if (!create.ok) return { step: 'create', fail: create.error }

    const stream = await window.api.ai.chatStream({
      profileId: create.data.id,
      messages: [{ role: 'user', content: '请准确回复以下六个字：连接测试成功' }]
    })
    if (!stream.ok) return { step: 'chatStream', fail: stream.error }

    const outcome = await new Promise((resolve) => {
      let text = '', reasoningLen = 0, err = ''
      let unsub
      const finish = () => { if (unsub) unsub(); resolve({ text, reasoningLen, err }) }
      unsub = window.api.ai.onStreamEvent((evt) => {
        if (evt.requestId !== stream.data.requestId) return
        if (evt.type === 'chunk') text += evt.text
        if (evt.type === 'reasoning') reasoningLen += evt.text.length
        if (evt.type === 'done') finish()
        if (evt.type === 'error') { err = evt.message; finish() }
      })
    })

    const setDef = await window.api.settings.set('ai.default_profile_id', create.data.id)
    const list = await window.api.apiProfiles.list()
    return {
      step: 'ok',
      profile: { id: create.data.id, name: create.data.name, model: create.data.model },
      stream: outcome,
      setDefaultOk: setDef.ok,
      listCount: list.ok ? list.data.length : -1
    }
  })()`

  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  ws.close()
  console.log(JSON.stringify(r.result.value, null, 1))
}

main().catch((e) => {
  console.error('SELFTEST-FAIL:', e.message)
  process.exit(1)
})

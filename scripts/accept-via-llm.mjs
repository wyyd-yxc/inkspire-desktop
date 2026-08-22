/**
 * 外部模型二次验收脚本（LLM Review）。
 * 用法：node scripts/accept-via-llm.mjs <材料文件.md> [--model <模型名>] [--base-url <API根地址>] [--key-env <密钥环境变量名>]
 * - 默认走 OpenRouter（stealth/ox-alpha）；--base-url 可切换任意 OpenAI 兼容端点
 * - Key 优先级：--key-env 指定的环境变量 > OPENROUTER_API_KEY > ZCode 配置中的 OpenRouter 档案
 * - 附带材料：自动附加 git diff <上一tag>..HEAD 中 src/ 的变更（截断至上限）
 * - 输出：模型审查意见打印到 stdout，并保存到 docs/acceptance/llm-review-<时间戳>.md
 * 注意：任何情况下不得把 key 打印到输出。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i > 0 ? process.argv[i + 1] : undefined
}

const BASE_URL = (argValue('--base-url') || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
const MODEL = argValue('--model') || 'stealth/ox-alpha'
const KEY_ENV = argValue('--key-env')

function resolveKey() {
  if (KEY_ENV && process.env[KEY_ENV]) return process.env[KEY_ENV]
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), '.zcode', 'v2', 'config.json'), 'utf8')
    )
    const p = Object.values(cfg.provider || {}).find((x) =>
      (x.options?.baseURL || '').includes('openrouter')
    )
    return p?.options?.apiKey || ''
  } catch {
    return ''
  }
}

/** 收集上一 tag 到 HEAD 的 src/ 变更 diff（限长防请求超限：ox-alpha 对超长输入会返回空，经验上限约 2 万字） */
function collectDiff(maxChars = 15000) {
  let base
  try {
    base = execSync('git describe --abbrev=0 --tags', { cwd: ROOT })
      .toString()
      .trim()
  } catch {
    base = 'HEAD~5'
  }
  try {
    const diff = execSync(`git diff ${base}..HEAD -- src/`, {
      cwd: ROOT,
      maxBuffer: 20 * 1024 * 1024
    }).toString()
    return diff.length > maxChars ? diff.slice(0, maxChars) + '\n…(diff 已截断)' : diff
  } catch (e) {
    return `(diff 收集失败: ${e.message})`
  }
}

async function main() {
  const materialFile = process.argv[2]
  const modelIdx = process.argv.indexOf('--model')
  const model = modelIdx > 0 ? process.argv[modelIdx + 1] : 'stealth/ox-alpha'
  if (!materialFile || !fs.existsSync(materialFile)) {
    console.error('用法: node scripts/accept-via-llm.mjs <材料文件.md> [--model <模型名>]')
    process.exit(1)
  }
  const key = resolveKey()
  if (!key) {
    console.error('未找到 OpenRouter Key（环境变量 OPENROUTER_API_KEY 或 ZCode 配置）')
    process.exit(1)
  }

  const material = fs.readFileSync(materialFile, 'utf8')
  const diff = collectDiff()

  const prompt = `你是「墨灵桌面版」项目的独立验收审查员（外部模型）。以下是开发方提交的验收材料与代码变更，请以挑剔的审查者视角给出结论。

要求：
1. 逐条核对验收点，判断材料是否足以证明其达成，指出材料中的疑点
2. 审查代码变更中的明显缺陷（逻辑错误、安全隐患、规范违背）
3. 你只能基于给定材料静态审查，无法运行程序——明确区分「可判定」与「无法判定（需运行验证）」的项
4. 输出 markdown，格式：## 结论（通过/有条件通过/不通过 + 一句话）→ ## 逐项核对 → ## 发现的问题（含严重级别）→ ## 无法判定项

==== 验收材料（${path.basename(materialFile)}） ====
${material}

==== 代码变更 diff ====
\`\`\`diff
${diff}
\`\`\``

  const key2 = key
  /** 该模型非流式响应可能返回空白，统一走 SSE 流式拼接 */
  async function callApi(maxTokens) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key2}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        stream: true
      })
    })
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return out
        try {
          const j = JSON.parse(payload)
          out += j.choices?.[0]?.delta?.content || ''
        } catch {
          // 忽略心跳/注释行
        }
      }
    }
    return out
  }

  console.error(`调用 ${model} 审查中…（材料 ${material.length} 字 + diff ${diff.length} 字）`)
  let out = ''
  try {
    out = await callApi(16000)
  } catch (e) {
    console.error(`首次调用失败: ${e instanceof Error ? e.message : e}`)
  }
  if (!out.trim()) {
    console.error('回复为空/失败，重试（32k 预算）…')
    try {
      out = await callApi(32000)
    } catch (e) {
      console.error(`重试失败: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (!out.trim()) out = '(模型两次均未返回内容，静态审查未完成——以子代理黑盒验收为准，本报告需人工复核)'
  console.log(out)

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17)
  const outFile = path.join(ROOT, 'docs', 'acceptance', `llm-review-${stamp}.md`)
  fs.writeFileSync(outFile, `# LLM 审查（${model}）\n\n> 材料来源：${path.basename(materialFile)}\n\n${out}\n`)
  console.error(`\n已保存: ${outFile}`)
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})

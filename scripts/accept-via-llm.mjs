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
/** 直接指定 ZCode 配置里的 provider 名（如 "GMI Cloud"）读取 key 与默认地址 */
const PROVIDER_NAME = argValue('--provider-name')

function resolveKeyAndBase() {
  if (KEY_ENV && process.env[KEY_ENV]) return { key: process.env[KEY_ENV], base: undefined }
  if (process.env.OPENROUTER_API_KEY)
    return { key: process.env.OPENROUTER_API_KEY, base: 'https://openrouter.ai/api/v1' }
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), '.zcode', 'v2', 'config.json'), 'utf8')
    )
    // --provider-name：按 provider 名精确匹配（GMI Cloud / 基元律动 / OpenRouter…）
    if (PROVIDER_NAME) {
      const p = Object.values(cfg.provider || {}).find((x) => x.name === PROVIDER_NAME)
      if (p?.options?.apiKey)
        return { key: p.options.apiKey, base: p.options.baseURL || undefined }
      throw new Error(`ZCode 配置中未找到名为「${PROVIDER_NAME}」的 provider`)
    }
    const p = Object.values(cfg.provider || {}).find((x) =>
      (x.options?.baseURL || '').includes('openrouter')
    )
    return { key: p?.options?.apiKey || '', base: 'https://openrouter.ai/api/v1' }
  } catch {
    return { key: '', base: undefined }
  }
}

/** 收集上一 tag 到 HEAD 的 src/ 变更 diff（限长防请求超限：ox-alpha 对超长输入会返回空，经验上限约 2 万字）
 *  --base <ref>：显式指定 diff 基准（tag/commit）。里程碑验收在打 tag 之后进行时必须提供，
 *  否则「最近 tag」就是 HEAD，diff 为空、审查无料可看（M16 教训）。 */
function collectDiff(maxChars = 15000) {
  let base = argValue('--base')
  if (!base) {
    try {
      base = execSync('git describe --abbrev=0 --tags', { cwd: ROOT })
        .toString()
        .trim()
    } catch {
      base = 'HEAD~5'
    }
  }
  try {
    const diff = execSync(`git diff ${base}..HEAD -- src/ electron-builder.yml package.json`, {
      cwd: ROOT,
      maxBuffer: 20 * 1024 * 1024
    }).toString()
    if (!diff.trim()) return `(基准 ${base}..HEAD 无 src/ 与打包配置差异——请确认 --base 是否正确)`
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
  const resolved = resolveKeyAndBase()
  if (!resolved.key) {
    console.error('未找到可用的 API Key（--key-env / OPENROUTER_API_KEY / --provider-name / ZCode 配置）')
    process.exit(1)
  }
  const effectiveBase = (argValue('--base-url') || resolved.base || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const key = resolved.key

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
    const res = await fetch(`${effectiveBase}/chat/completions`, {
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

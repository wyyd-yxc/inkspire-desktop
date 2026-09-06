# M10.5 验收材料 r3（二轮遗留三项补正）

> 主体：material-M10.5-sync.md；一轮回应：material-M10.5-sync-r2.md。本轮只补二轮声明缺失的三个证据项。

## E. 自测原始输出（附录 E 补齐）

### T1 最终回归（935dbdc 原子水位版，tmp/m105-t1-final.log 全文摘要）
PASS | 百科提取弹窗打开
PASS | 待提取章节数=2（水位初始为空） | count=2
PASS | 提取完成弹出候选面板
PASS | 词条入库且默认 manual | ["林昭","聂无双","苏九","青云宗","血衣楼","玄铁令","雪参丸","落雁城","破庙","北境古墓","上古剑冢","青冥诀"]
PASS | wiki 水位推进（两章） | {"f0ec5b5f-0d92-45ce-8049-eca5d36a2936":12,"1cabbee8-c978-4432-9a28-d5933e6740a6":130,"58618c4a-2298-46bd-8f20-b6f0a2311d28":6135,"d6012671-eefe-400d-b690-6d4904b7dfc2":120,"5c09a6e8-a694-4db0-a28a-8ea53e88c190":100,"e21cbe3b-8bb7-4235-b9fc-6a0015d8a592":120,"d4bdbc98-6b19-4f5f-9c48-adb26fda5d24":100,"e9d06778-e527-4ccb-99f6-595884f954de":80,"f16efbe3-fd8c-49c8-8aaa-4db7a9082242":120,"ce4e8e49-4091-43cd-9d54-9da292becdda":100}
PASS | 复跑提取被水位拦截（零重复路径 A） | {"dialogOpen":true,"disabled":true,"count":0}
PASS | 复跑后词条数不变 | 12→12
PASS | 记忆抽取弹窗打开
PASS | 记忆抽取完成弹候选面板
PASS | 记忆首次入库 | count=12
PASS | 复跑抽取被水位拦截 | {"disabled":true,"count":0}
PASS | 强抽二抽后零字面重复（本地保险生效） | 总数 12→12，字面重复对=无
PASS | 二抽后水位重新推进 | {"f16efbe3-fd8c-49c8-8aaa-4db7a9082242":120,"ce4e8e49-4091-43cd-9d54-9da292becdda":100}
PASS | 清理重复：精确删（2 条相同→1 条） | 2→1
PASS | 创世台推送按钮可见（step3 有数据 + 造世步激活）
PASS | 推送词条入库（character/lore, always） | ["林昭:character:manual","聂无双:character:manual","苏九:character:manual","林昭：青云宗弃徒，持玄铁令，身负剑伤，性格坚忍:character:always","青云宗:faction:manual","血衣楼:faction:manual","玄铁令:item:manual","雪参丸:item:manual","落雁城:location:manual","破庙:location:manual","北境古墓:location:manual","上古剑冢:location:manual","灵力分九品；玄铁令可开启上古剑冢:lore:always","青冥诀:skill:manual"]
PASS | 推送幂等（复推数量不变） | 14→14
PASS | 无 console 报错
==== T1 汇总: 18/18 通过 ====

### T2/T3/T4 汇总行（此前会话实录）
- T2：8/8（含「剧情 AI 弹窗联动信息行 | 已联动：1 章进度 · 1 条记忆 · 1 条常驻设定」「续写采纳后章节字数增长 | 110→751」）
- T3：12/12（含「提醒档 tick 自动置红点」「静默档自动入库词条 wiki=7」「静默复跑零新增 10→10」「关闭开关后立即检测禁用」）
- T4：4/4（「dev 重启成功」「重启后设置回显 enabled:true interval:'30'」「重启后水位保留」逐键一致）

## B2. session 赋值时序源码佐证（services/ai.ts chatStream）

chatStream 的 resolve 时机 = invoke('ai:chat-stream') 返回 requestId 之后、任何流事件之前；
onChunk/onDone 是后续 WebSocket 推送事件。因此 `generateWriting(...).then(({ session }) => ...)` 的赋值
必然先于 onDone（流事件到达在 requestId 之后至少一个网络往返）。源码：
```ts
export async function chatStream(
  profile: Pick<ApiProfile, 'id' | 'name' | 'providerKind' | 'baseUrl' | 'apiKey' | 'model' | 'params'>,
  messages: ChatMessage[],
  handlers: StreamHandlers
): Promise<StreamSession> {
  if (!isElectron) throw new Error('AI 功能仅支持在应用内使用')

  // 1) 先订阅并缓冲全部事件（此刻 requestId 未知，全部入队）
  const buffer: AiStreamEvent[] = []
  let bindRequestId = ''
  let unsub: (() => void) | null = null
  unsub = window.api.ai.onStreamEvent((evt) => {
    if (!bindRequestId) {
      buffer.push(evt)
      return
    }
    if (evt.requestId === bindRequestId && dispatch(evt, handlers)) {
      // 终结事件（done/error）：解绑监听器，避免高频调用下累积泄漏
      unsub?.()
      unsub = null
    }
  })

  try {
    // 2) 发起请求拿到 requestId
    const res = await window.api.ai.chatStream(
      profile.id ? { profileId: profile.id, messages } : { profile, messages }
    )
    if (!res.ok) throw new Error(res.error)
    bindRequestId = res.data.requestId

    // 3) 回放缓冲期间到达的本请求事件（单线程下不会与后续事件交错）
    for (let i = 0; i < buffer.length; i++) {
      const evt = buffer[i]
      if (evt.requestId !== bindRequestId) continue
      if (dispatch(evt, handlers)) {
        buffer.length = 0
        unsub?.()
        unsub = null
        break
      }
    }
    buffer.length = 0

    return {
      requestId: bindRequestId,
      abort: () => {
        void window.api.ai.abort(bindRequestId)
      }
    }
  } catch (err) {
    unsub?.()
    throw err
  }
}
```

## §2. tick 间隔门槛源码（composables/useAutoSync.ts）

`enabled=false` 早返回在间隔判断**之前**（tick 每次重读设置；关闭期间 lastCheckAt 不推进但也不检测）；
重新开启后首个 tick 满足 `now - lastCheckAt >= interval` 立即检测一次——此即 r2 回应的「用户预期行为」；
之后严格按 interval 节流。静默档单轮 ≤3 章上限为独立保险（SILENT_MAX_CHAPTERS）。源码：
```ts
102:async function tick(): Promise<void> {
103-  try {
104-    const s = await loadAutoSyncSettings()
105-    if (!s.enabled) return
106-    if (Date.now() - lastCheckAt < s.intervalMin * 60_000) return
107-    lastCheckAt = Date.now()
108-    await checkOnce(s)
109-  } catch {
110-    // 定时器内吞错（读设置/网络抖动），下个 tick 自动重试
111-  }
112-}
50:const SILENT_MAX_CHAPTERS = 3
191:    const round = jobs.slice(0, SILENT_MAX_CHAPTERS)
```

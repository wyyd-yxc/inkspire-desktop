# M10.8 验收材料 r4（三轮处置 + 终审附录）

> 前序：主体 → r2（一轮处置+附录A）→ r3（二轮处置）→ 本轮。整改：fe9f1a6（统一事务）、白名单守卫 commit。

## 三轮处置

| 三轮条目 | 处置 |
|---|---|
| 中-1 映射措辞「非不可逆」有粉饰嫌疑 | **接受措辞批评**：准确表述为「映射在 DB 层静默抹除都市/言情的类目区分（不可逆），但字段为用户可再编辑的自由文本、影响限于分类展示」。此映射系用户批准的计划原文，登记为已知晓的语义收敛 |
| 中-2 UI 题材选项同步无法判定 | **附录 B 补 book.types.ts（BOOK_GENRES 常量）与 BookCreateDialog.vue 题材选择器源码**——选择器 v-for 引用常量、无旧值硬编码，静态可判 |
| 中-3 diff 截断 | 固有限制；全局零残留 = 全仓 grep（墨灵/书斋/创世台/金手指/定魂/爽点/网文等 15 词=0 命中，可在本地复核）+ CDP 走查断言（旧命名残留=空数组）+ 黑盒独立复测三重实证 |
| 无法判定 1（同目标去重运行验证）| 黑盒轨道覆盖（M107 回归含应用后 diff 断言） |

## 附录 B：题材常量与选择器源码
### src/shared/book.types.ts（BOOK_GENRES）
```ts
/**
 * 书籍实体与输入类型（跨进程共享契约）。
 * 命名用 camelCase；与数据库 snake_case 行的映射在 DAO 层完成。
 */

/** 题材分类（M10.8 严肃写作命名；旧值经 migration v11 映射） */
export const BOOK_GENRES = [
  '长篇',
  '中短篇',
  '科幻',
  '历史',
  '悬疑',
  '奇幻',
  '现实主义',
  '武侠',
  '其他'
] as const

export type BookGenre = (typeof BOOK_GENRES)[number]

/** 书籍状态：创作中 / 完结 / 封存（archived 在书房中隐藏） */
export type BookStatus = 'writing' | 'finished' | 'archived'
```
### src/renderer/src/components/BookCreateDialog.vue 题材选择器段
```vue

          <div class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">分类</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="g in BOOK_GENRES"
                :key="g"
                type="button"
                class="rounded-full border px-3 py-1 text-sm transition-colors"
                :class="
                  form.genre === g
                    ? 'border-ink-primary bg-ink-primary-soft text-ink-primary'
                    : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                "
                @click="form.genre = form.genre === g ? '' : g"
```

### 全仓旧命名 grep 实证（本地可复现命令与输出）
```
0
```

/**
 * 预设风格包（定风步占位用）。
 * M14「拆书」模块完成后可替换为用户自建/拆解生成的真实风格包。
 * 每个风格包含：用于展示的描述+样例，以及注入 AI 提示词的 promptHint。
 */
export interface PresetStyle {
  id: string
  name: string
  description: string
  /** 文风样例片段（展示给用户看风格长什么样） */
  sample: string
  /** 注入 AI system 提示的文风约束 */
  promptHint: string
}

export const PRESET_STYLES: PresetStyle[] = [
  {
    id: 'hot-blood',
    name: '热血升级流',
    description: '节奏明快、爽点密集，主角从弱到强不断突破，战斗与成长交织。',
    sample: '拳风破空，灵力如潮水般涌入经脉。他咬紧牙关，眼底燃着不甘的火——这一步，他等了三年。',
    promptHint: '文风热血明快，节奏紧凑，爽点密集；多用短句和动作描写，战斗场面凌厉有力，主角意志坚定、不断成长。'
  },
  {
    id: 'relax-daily',
    name: '轻松日常流',
    description: '生活气息浓厚，节奏舒缓，重人物互动与细节趣味，淡化战斗。',
    sample: '夕阳把小院染成暖黄。她端着刚蒸好的桂花糕推门进来，猫从墙头跳下，蹭了蹭她的脚踝。',
    promptHint: '文风轻松温馨，节奏舒缓，重生活细节与人物互动；描写细腻有画面感，少战斗多日常，语调柔和。'
  },
  {
    id: 'suspense',
    name: '悬疑烧脑流',
    description: '层层悬念、伏笔密布，信息层层揭示，氛围紧张压抑。',
    sample: '门是从里面反锁的。可桌上的茶还温着，窗外却没有半个脚印。他盯着那杯茶，后背沁出冷汗。',
    promptHint: '文风悬疑紧张，伏笔密布，信息层层揭示；多用环境与心理描写营造压抑氛围，节奏张弛有度，留白引人猜测。'
  },
  {
    id: 'classical',
    name: '古风文雅流',
    description: '用词典雅、句式考究，有古典韵味，适合仙侠/历史题材。',
    sample: '剑光如练，破开十里云海。她立于峰顶，衣袂翻飞，眉间一点朱砂，映着天边将坠的残阳。',
    promptHint: '文风古雅考究，用词典雅，句式工整有韵律；多四字短语与意境描写，适合仙侠/历史题材，有古典文学质感。'
  },
  {
    id: 'scifi-hard',
    name: '硬核科幻流',
    description: '科技设定严谨、逻辑自洽，重世界观推演与硬核细节。',
    sample: '引力波警报在第三轨道响起时，曲率引擎的冷却液已逼近临界值。他盯着读数，做着一个没有退路的计算。',
    promptHint: '文风严谨克制，科技设定自洽有逻辑；重世界观推演与硬核细节，专业术语适度，氛围冷峻理性。'
  }
]

/** 按 id 查预设风格 */
export function getPresetStyle(id: string): PresetStyle | undefined {
  return PRESET_STYLES.find((s) => s.id === id)
}

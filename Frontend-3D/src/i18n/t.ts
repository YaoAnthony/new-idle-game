/**
 * i18n 最小壳。Core 里所有名字都是 localizationKey，这里做 key → 文案。
 * 目前只有中文；日文以后填进同结构的词典即可。
 */

const ZH: Record<string, string> = {
  // 物品
  "item.wood": "木头",
  "item.plank": "木板",
  "item.stick": "木棒",
  "item.sugarcane": "甘蔗",
  "item.paper": "纸",
  "item.leather": "牛皮",
  "item.graphite": "黑粉末",
  "item.iron_ingot": "铁块",
  "item.root": "木根",
  "item.notebook": "牛皮本子",
  "item.pencil": "铅笔",
  "item.furniture_kitchen_counter": "整体橱柜",
  "item.furniture_workbench": "普通工作台",
  "item.furniture_table": "木桌",
  "item.furniture_chair": "木椅",
  "item.furniture_rug": "圆地毯",
  "item.furniture_dumbbell": "哑铃",
  "item.tomato": "番茄",
  "item.egg": "鸡蛋",
  "item.fried_tomato_egg": "番茄炒蛋",

  // 物品介绍（背包悬浮）
  "item.wood.desc": "从森林里捡回来的木头，做什么都用得上。",
  "item.plank.desc": "刨平的木板，家具的基础。",
  "item.stick.desc": "结实的木棒，能当腿也能当柄。",
  "item.sugarcane.desc": "甜甜的甘蔗，晒干能造纸。",
  "item.paper.desc": "微微泛黄的纸，可以写点什么。",
  "item.leather.desc": "柔软的牛皮，缝个本子正好。",
  "item.graphite.desc": "黑色的粉末，铅笔芯的原料。",
  "item.iron_ingot.desc": "沉甸甸的铁块，闪着冷光。",
  "item.root.desc": "弯弯曲曲的木根，握起来意外顺手。",
  "item.notebook.desc": "牛皮封面的本子，适合记录生活。",
  "item.pencil.desc": "一支铅笔。写下今天想做的事吧。",
  "item.furniture_kitchen_counter.desc": "L 形整体橱柜，三个灶眼加一个水槽。摆好就是一间开放式厨房。",
  "item.furniture_workbench.desc": "普通的工作台，能打造简单的家具。",
  "item.furniture_table.desc": "一张木桌。有了桌子就能学习了。",
  "item.furniture_chair.desc": "一把木椅，坐上去吱呀作响。",
  "item.furniture_rug.desc": "圆圆的地毯，让房间暖和起来。",
  "item.furniture_dumbbell.desc": "一对哑铃。想运动的时候用。",
  "item.tomato.desc": "熟透的番茄，小动物们也爱吃。",
  "item.egg.desc": "一颗新鲜的鸡蛋。",
  "item.fried_tomato_egg.desc": "热腾腾的番茄炒蛋，家的味道。",

  // 场景道具。**只剩这几条**——家具并进物品之后名字统一走 "item.*"，
  // 这里留下的是三件玩家拿不到、也没有物品条目的房子自带道具
  "furniture.stove": "灶台",
  "furniture.stove.burner": "灶眼",
  "furniture.cardboard_box": "纸箱",
  "furniture.cardboard_stack": "纸箱堆",

  // 配方
  "recipe.plank_from_wood": "木板",
  "recipe.stick_from_wood": "木棒",
  "recipe.wooden_table": "木桌",
  "recipe.wooden_chair": "木椅",
  "recipe.paper_from_sugarcane": "纸",
  "recipe.notebook": "牛皮本子",
  "recipe.pencil": "铅笔",
  "recipe.dumbbell": "哑铃",
  "recipe.fried_tomato_egg": "番茄炒蛋",

  // 物品（M5 新增）
  "item.bedroll": "地铺",
  "item.bedroll.desc": "被子和枕头。第一天，就先睡地铺吧。",

  // 剧情提示（storyRules 的 show_toast）
  "story.moving_in": "终于搬进来了。行李还堆在角落，先按 B 打开背包，把东西一件件拿出来吧。",
  "story.pet_promise":
    "苔苔的卷芽支棱起来：下次我出去，一定给你带点你那边没有的东西回来！",
  "story.pet_missing": "醒来时墙角空空的——苔苔不见了。窗外好像有什么声音……",
  "story.day_one_wrap": "第一天就这样过去了。这个小家，之后慢慢布置吧。",

  // 教程步骤（tutorialDefinition）
  "tutorial.unpack": "走到门口的箱子旁边按 F，把行李拆开",
  "tutorial.backpack_unused": "按 B 打开背包，看看妈妈帮你收拾的行李",
  "tutorial.workbench": "从快捷栏选出工作台（按 1），放在屋里",
  "tutorial.craft": "走到工作台旁按 F，做一块木板试试",
  "tutorial.gift": "有小家伙进来了！过去打个招呼，送点吃的",
  "tutorial.action": "点右上角「行动」，写下你现实中要做的事",
  "tutorial.sleep": "铺开地铺（按 2），睡一觉吧",
  "tutorial.completed": "✨ 第一天圆满结束！这个小家，之后就慢慢布置吧。",

  // NPC
  "npc.mom": "妈妈",

  // 妈妈的第一通电话
  "dlg.mom.m1": "喂——？喂喂，接通了吗？宝贝，是我呀。",
  "dlg.mom.m2": "新家怎么样？房东没有为难你吧？有没有好好吃饭？",
  "dlg.mom.mc_good": "都挺好的，别担心啦",
  "dlg.mom.mc_pet": "我捡到了一只小动物！",
  "dlg.mom.m3": "那就好，那就好……你从小就让人省心。",
  "dlg.mom.m3b": "小动物？！你可别乱喂东西……算了，你有分寸。",
  "dlg.mom.m4": "对了，妈给你寄了个小机器，能帮你干点活的那种。快递可能要几天，注意查收哦。……那就先这样，照顾好自己！",

  // 宠物：物种名 + 初见时给的默认昵称（玩家之后能改，存 PetSave.nickname）
  "pet.unknown": "小家伙",
  "pet.moss_wisp": "苔灵",
  "pet.moss_wisp.nickname": "苔苔",
  "pet.foam_wisp": "沫灵",
  "pet.foam_wisp.nickname": "沫沫",
  "pet.ember_wisp": "烬灵",
  "pet.ember_wisp.nickname": "小烬",

  // 对话（苔苔初见）。调子是好奇话痨——它把你当"外面世界"的信息源。
  // n5 是全作的题眼：你递过去的是现实行动换来的东西，而它连见都没见过
  "dlg.first.n1": "唔……哇！撞、撞到墙了……",
  "dlg.first.n2": "（那团苔藓一样的东西晃了晃，头顶的卷芽抖开一点，两颗黑点转过来盯住你）",
  "dlg.first.c_who": "你是什么呀？",
  "dlg.first.c_new": "我是新搬来的住客",
  "dlg.first.n3":
    "我是从林子那边的湿石头上长出来的！长着长着就会动了，然后就到处跑。你呢你呢？你是从哪长出来的？",
  "dlg.first.n3b":
    "住客！住客是什么？是一种会自己搬东西进来的生物吗？——啊，我叫苔苔。这屋子空了好久，我常从窗户缝钻进来躲雨。",
  "dlg.first.n4":
    "（苔苔绕着你转了两圈，卷芽一颤一颤的）你身上有股味道，我从来没闻到过。你那边……有我没见过的东西吗？",
  // 送礼的四档反应。差别全在**反应**上，四档都不扣好感、四档都推进剧情——
  // 递错东西是了解它的过程，不该被惩罚（见 giftRules.ts）。
  // 不喜欢/不能吃这两档要写清「东西还在你手上」，否则玩家会以为白送了
  "dlg.first.n5_loved":
    "这个……这是什么？我在林子里从来没见过这种东西！一次都没有！\n（它小心地咬了一口，头顶的卷芽啪地整个舒展开）\n……你真的不是这里的。你那边还有别的吗？我想知道，全都想知道。",
  "dlg.first.n5_liked":
    "唔，谢谢你！\n（它接过去一小口一小口吃完了，卷芽轻轻晃了两下）\n能吃，挺好的。不过这东西我在林子里没见过——你那边的东西，都是这样长出来的吗？",
  "dlg.first.n5_disliked":
    "（苔苔凑过去闻了闻，卷芽慢慢卷紧一点，往后退了半步）\n……这个我就不吃啦，你自己留着。\n不过你能拿出这种东西来——我从来没闻到过这个味道。你那边到底是什么样的呀？",
  "dlg.first.n5_inedible":
    "（苔苔盯着看了好一会儿，认真地摇了摇头）\n这个我吃不了——不是不喜欢，是真的没办法吃。\n（它把东西推回你手里，卷芽却还朝着你这边）\n……可你连这种东西都有。你那边究竟是个什么地方？",
  "dlg.first.n6": "没有也没关系！那我在这儿等等看。反正我也没别的地方要去。",
  "dlg.first.n7":
    "（苔苔在墙角坐下来，偷偷瞄了你好几眼，好像有一肚子问题没问完）",
  // 开场独白：搬进新家的第一分钟。三句话说明白"到家了""屋子是空的"
  // "先拆门口那两个箱子"，把玩家的第一个动作指出来
  "dlg.movein.m1": "……终于到了。\n（你放下背包，屋子里空得能听见回声）",
  "dlg.movein.m2":
    "这就是我的家了啊。比照片上还大一点——客厅、两间屋、还有个能看见院子的大窗户。",
  "dlg.movein.m3":
    "行李都在门口那两个箱子里。\n先把它们拆了，慢慢收拾吧。",

  "dlg.casual.c1": "（苔苔凑过来闻了闻你，卷芽轻轻晃了两下）",
  "dlg.casual.cc_gift": "给你带了点东西",
  "dlg.casual.cc_bye": "只是路过看看你",
  "dlg.casual.c_give": "给我的？给我的吗？（它整个凑了上来）",
  "dlg.casual.c_loved":
    "是这个！我就想吃这个！\n（卷芽噌地竖起来，它三两口就吃完了，还小心地把碎屑舔干净）\n你怎么知道的呀？",
  "dlg.casual.c_liked": "谢谢你——（它慢慢吃完了）嗯，吃饱啦。",
  "dlg.casual.c_disliked":
    "（闻了闻，卷芽卷紧一点）……这个我就先不吃了。你留着吧，别浪费。",
  "dlg.casual.c_inedible":
    "（认真地看了半天，摇摇头把东西推回来）这个真的吃不了呀。不过你拿来给我看，我很高兴。",
  "dlg.casual.c_bye": "那你去忙吧！我就在这儿。",

  // 事件
  "event.pet_arrival": "角落里的小家伙",

  // 行动：四大分类（图里的卡片标题用「…任务」，正文里用短名）
  "action.work_study": "工作或学习任务",
  "action.exercise": "运动任务",
  "action.creation": "创作任务",
  "action.rest": "休息任务",

  // 重要级
  "action_priority.low": "低",
  "action_priority.normal": "普通",
  "action_priority.high": "重要",

  // 界面
  "ui.actions": "行动",
  "ui.new_action": "创建行动",
  "ui.action_name_placeholder": "想做什么？比如：写完 assignment2",
  "ui.start_action": "开始",
  "ui.you": "你",
  // 每天一次的节流。写成"它今天吃饱了"而不是"今日次数已用完"——
  // 是它的状态，不是玩家被系统限制了
  "ui.gift_already_today": "（它今天已经吃饱啦，明天再来吧）",
  "ui.gift_drop": "放入",
  // 一次性领取面板（拆箱 / 任务奖励通用）
  "ui.reward_subtitle": "已经放进你的背包",
  "ui.reward_claim": "收下",
  "loot.moving_tools": "打开了工具箱",
  "loot.moving_furniture": "打开了家什箱",
  "hint.unpack": "拆开箱子",
  // 「不给了」是玩家的动作，不能复用「现在没有吃的…」——那是一句陈述，
  // 而且新 UI 里背包全都能递，"没有吃的"这个前提本身也不成立了
  "ui.decline_gift": "这次不给了",
  "ui.gift_full": "吃饱了",
  // 明说"什么都能递"——玩家默认会以为只能给吃的，那就试不出四档反应了
  "ui.gift_hint": "把任何东西拖进框里都能递给它",
  "ui.continue": "继续",
  "ui.backpack": "背包",
  "ui.craft": "制作",
  "ui.cooking": "烹饪",
  "ui.close": "关闭",

  // 家具交互气泡（走近时浮在家具上方）
  "hint.stove": "做饭",
  "hint.workbench": "制作家具",
  // 床是两步：先躺下，躺着再按 F 才睡觉
  "hint.bedroll": "躺一会儿",
  "hint.bed": "躺一会儿",
  "hint.bookshelf": "看看书",
  "hint.chest": "打开箱子",
  "hint.chair": "坐下歇会儿",
  "hint.stool": "坐下歇会儿",
  "hint.cushion": "坐下歇会儿",
  "hint.fireplace": "烤烤火",
  "hint.floor_lamp": "开灯 / 关灯",
  "hint.potted_plant": "浇点水",
  "ui.pickup_hint": "右键拿起",
  // 操作提示行。原来直接写死在 Hotbar 组件里——用户可见文案不该躺在组件里
  "ui.help.controls":
    "B 背包 · F 使用 · Q 扔出 · 拖动左键转镜头 · 滚轮缩放 · 右键拿起家具 · 手上拿着家具时左键放下 · ↑↓←→ 微调 · R 旋转",
  "ui.cooking_in_progress": "烹饪中…",
  // 消息面板
  "ui.chat.closed_hint": "回车说话 · / 开命令",
  "ui.chat.placeholder": "说点什么，或者用 / 开头敲指令…",
  "ui.chat.dismiss": "Esc 收起",

  // ---- 生活感扩充：物品 ----
  "item.furniture_bookshelf": "书架",
  "item.furniture_storage_chest": "储物箱",
  "item.furniture_bed": "木床",
  "item.furniture_stool": "小圆凳",
  "item.furniture_cushion": "坐垫",
  "item.furniture_fireplace": "壁炉",
  "item.furniture_floor_lamp": "落地灯",
  "item.furniture_potted_plant": "盆栽",
  "item.furniture_picture_frame": "相框",
  "item.furniture_wall_clock": "挂钟",
  "item.furniture_curtain": "窗帘",

  "item.furniture_bookshelf.desc": "顶天立地的书架。书塞满以后，房间就像样了。",
  "item.furniture_storage_chest.desc": "胖乎乎的木箱，杂物一股脑塞进去。",
  "item.furniture_bed.desc": "终于不用打地铺了。被子记得晒。",
  "item.furniture_stool.desc": "三条腿的小圆凳，随手一坐刚刚好。",
  "item.furniture_cushion.desc": "软软的坐垫，最适合窝在地上发呆。",
  "item.furniture_fireplace.desc": "石砌的壁炉。柴火噼啪响，冬天就不怕了。",
  "item.furniture_floor_lamp.desc": "布罩落地灯，夜里留一盏，屋子就暖了。",
  "item.furniture_potted_plant.desc": "一盆好养活的绿植。记得偶尔浇水。",
  "item.furniture_picture_frame.desc": "画着远山和落日的小相框，挂在墙上。",
  "item.furniture_wall_clock.desc": "滴答作响的木壳挂钟，日子有了声音。",
  "item.furniture_curtain.desc": "厚厚的窗帘，拉上就能睡个懒觉。",

  // ---- 生活感扩充：配方 ----
  "recipe.bookshelf": "书架",
  "recipe.storage_chest": "储物箱",
  "recipe.wooden_bed": "木床",
  "recipe.round_stool": "小圆凳",
  "recipe.floor_cushion": "坐垫",
  "recipe.fireplace": "壁炉",
  "recipe.floor_lamp": "落地灯",
  "recipe.potted_plant": "盆栽",
  "recipe.picture_frame": "相框",
  "recipe.wall_clock": "挂钟",
  "recipe.curtain": "窗帘",

  // ---- 铺地扩充 ----
  "hint.sofa": "坐下来歇会儿",
  "hint.wardrobe": "翻翻衣柜",

  "item.furniture_long_rug": "长毛地毯",
  "item.furniture_tatami_mat": "草编席",
  "item.furniture_door_mat": "门口地垫",
  "item.furniture_fabric_sofa": "布艺沙发",
  "item.furniture_wardrobe": "衣柜",
  "item.furniture_study_desk": "书桌",
  "item.furniture_coffee_table": "矮几",

  "item.furniture_long_rug.desc": "铺开一大片的长毛地毯。踩上去脚是暖的。",
  "item.furniture_tatami_mat.desc": "草香还没散的编席。盘腿坐着最舒服。",
  "item.furniture_door_mat.desc": "进门先蹭蹭鞋。屋子干净，心也干净。",
  "item.furniture_fabric_sofa.desc": "三人座的软沙发。一坐下就不太想起来了。",
  "item.furniture_wardrobe.desc": "高高的衣柜，关上门就藏住了所有乱。",
  "item.furniture_study_desk.desc": "带抽屉的书桌。摊开本子就能开始干活。",
  "item.furniture_coffee_table.desc": "沙发前的矮几，放杯热的刚刚好。",

  "recipe.long_rug": "长毛地毯",
  "recipe.tatami_mat": "草编席",
  "recipe.door_mat": "门口地垫",
  "recipe.fabric_sofa": "布艺沙发",
  "recipe.wardrobe": "衣柜",
  "recipe.study_desk": "书桌",
  "recipe.coffee_table": "矮几",

  // 画架（创作类的解锁条件）
  "hint.easel": "画点什么",
  "item.furniture_easel": "画架",
  "item.furniture_easel.desc": "支起来的画板，颜料还没干。想创作的时候用。",
  "recipe.easel": "画架",

  // ---- 行动 UI（三屏：分类网格 → 分类列表 → 添加表单）----
  "ui.action.title": "行动",
  "ui.action.pick_category": "选择一个行动类型",
  "ui.action.enter": "点击进入",
  "ui.action.locked": "缺少对应家具",
  "ui.action.unlocked_hint": "新功能已解锁",

  "ui.action.pick_entry": "选择一个现实里要做的行动",
  "ui.action.add": "添加行动",
  "ui.action.empty_title": "还没有行动",
  "ui.action.empty_hint": "先添加一个你现实里想做的事",
  "ui.action.list_footer_empty":
    "添加后会出现在这里，点击开始后角色会在房间里使用家具行动",
  "ui.action.list_footer": "开始后，角色会在房间里使用家具行动",
  "ui.action.start": "开始",
  "ui.action.delete": "删除",

  "ui.action.form_title": "添加行动",
  "ui.action.what": "要做什么",
  "ui.action.what_placeholder": "例如：写作业",
  "ui.action.how_long": "做多久",
  "ui.action.priority": "重要级",
  "ui.action.furniture": "使用家具",
  "ui.action.cancel": "取消",
  "ui.action.save": "保存行动",
  "ui.action.form_footer":
    "保存后会回到列表，点击开始后角色会在房间里使用家具行动",
  "ui.action.minutes": "分钟",

  // 行动进行中 / 结束
  "ui.action.stop_early": "提前结束（无奖励）",
  "ui.action.cancelled": "行动已取消",
  "ui.action.completed": "完成了！",
  "ui.action.companion_suffix": "一直在旁边陪着你",

  // 疲劳门槛
  "ui.action.too_tired": "太累了，先睡一觉或做件休息任务",
  "ui.action.fatigue_cost": "消耗精力",
  "ui.action.fatigue_restore": "恢复精力",

  // ---- 厨房系统 ----

  // 厨具与盛器
  "item.wok": "炒锅",
  "item.wok.desc": "从老房子带来的铁炒锅，架在灶眼上正好。",
  "item.tall_pot": "高锅",
  "item.tall_pot.desc": "深口的高锅，煮饭熬汤都靠它。",
  "item.plate": "盘子",
  "item.plate.desc": "素白的盘子。菜做好了就盛出来。",
  "recipe.tall_pot": "高锅",
  "recipe.plate": "盘子",

  // 食材
  "item.rice": "米",
  "item.rice.desc": "一把生米。得下锅煮才能吃。",
  "item.green_pepper": "青椒",
  "item.green_pepper.desc": "脆生生的青椒，切开有股清香。",
  "item.pork": "肉",
  "item.pork.desc": "一块新鲜的肉。",
  "item.century_egg": "皮蛋",
  "item.century_egg.desc": "黑亮的皮蛋，第一次见的人都会愣一下。",
  "item.baby_cabbage": "娃娃菜",
  "item.baby_cabbage.desc": "小小一颗的娃娃菜，煮软了最甜。",
  "item.cheese": "奶酪",
  "item.cheese.desc": "你那边的东西。这个世界从来没有人见过它。",

  // 成品菜
  "item.fried_egg": "煎鸡蛋",
  "item.fried_egg.desc": "边缘焦香的煎蛋。也可以再加点番茄下去。",
  "item.cooked_rice": "白米饭",
  "item.cooked_rice.desc": "冒着热气的白米饭。",
  "item.pepper_pork": "青椒炒肉",
  "item.pepper_pork.desc": "下饭的青椒炒肉，油光发亮。",
  "item.baby_cabbage_soup": "上汤娃娃菜",
  "item.baby_cabbage_soup.desc": "浓汤煮到透亮的娃娃菜，暖到胃里。",

  // 菜谱
  "recipe.fried_egg": "煎鸡蛋",
  "recipe.cooked_rice": "白米饭",
  "recipe.pepper_pork": "青椒炒肉",
  "recipe.baby_cabbage_soup": "上汤娃娃菜",

  // 加工方式（长按提示要显示这个字）
  "cook_method.fry": "炒",
  "cook_method.boil": "煮",
  "cook_method.steam": "蒸",
  "cook_method.mix": "拌",

  // 火候
  "cooking.band.raw": "刚下锅",
  "cooking.band.undercooked": "还没熟",
  "cooking.band.perfect": "正好",
  "cooking.band.overcooked": "焦了",

  // 厨房交互提示
  // 槽位状态：空手站在灶眼前时报状态而不是"按 F 做饭"——
  // 按了什么也不会发生，那句提示是假的
  "cooking.status.empty_burner": "空着的灶眼",
  "cooking.status.has_cookware": "灶眼上架着锅",
  "cooking.hint.place": "放上灶眼",
  "cooking.hint.pick_up": "端起来",
  "cooking.hint.add": "投进锅里",
  "cooking.hint.take_out": "起锅",
  "cooking.hint.serve": "盛出来",
  "cooking.reject.slot_refuses": "这里放不了这个",
  "cooking.reject.container_full": "已经装满了",
  "cooking.reject.not_ready": "还没熟，再等等",
  "cooking.reject.not_an_ingredient": "这个不能下锅",
  "cooking.reject.nothing": "没什么可做的",
  "cooking.reject.no_recipe": "这个搭配凑不出菜",
  "cooking.pot_not_empty": "锅里还有东西，先处理掉",
  "cooking.hands_full": "手上已经端着东西了",

  // 手持栏
  // 制作反馈：产出去哪了
  "ui.craft.into_hotbar": "做好了，放进了下方快捷栏",
  "ui.craft.into_backpack": "做好了，放进了背包（按 B 查看）",

  "ui.food_spoiled": "有些吃的放太久了，不太新鲜了",

  // 储物（hint.chest / hint.bookshelf 前面已经有了，不重复定义）
  "ui.storage.chest": "箱子里",
  "ui.storage.hint": "点一下就在箱子和背包之间搬 · Esc 关闭",

  // ---- 设置侧边栏 ----
  "ui.settings.title": "设置",
  "ui.settings.sound": "声音",
  "ui.settings.mute": "全部静音",
  "ui.settings.master": "主音量",
  "ui.settings.music": "音乐",
  "ui.settings.ambience": "环境音",
  "ui.settings.effects": "音效",
  "ui.settings.controls": "键位",
  "ui.settings.key_move": "移动",
  "ui.settings.key_interact": "交互",
  "ui.settings.key_backpack": "背包",
  "ui.settings.key_dump": "倒掉锅里的",
  "ui.settings.key_camera": "转动镜头",
  "ui.settings.key_zoom": "拉近拉远",
  "ui.settings.key_rotate": "旋转家具",
  "ui.settings.close": "关闭",

  // ---- 世界时钟与天气 ----
  "clock.phase.dawn": "清晨",
  "clock.phase.day": "白天",
  "clock.phase.dusk": "傍晚",
  "clock.phase.night": "夜里",

  "weather.sunny": "晴",
  "weather.cloudy": "阴",
  "weather.rain": "雨",
  "weather.wind": "风",
  "weather.storm": "暴雨",

  // 音频（注册表里的 localizationKey，将来做音量面板分组用）
  "audio.ambience_forest": "森林",
  "audio.ambience_sea": "海边",
  "audio.weather_rain": "雨声",
  "audio.weather_storm": "暴雨",
  "audio.thunder": "雷声",
  "audio.eat": "进食",
  "audio.unpack": "拆箱",

  // 坐 / 躺。站着时用家具自己的提示文案，这里只补状态变了之后的那两句
  "hint.stand": "起来",
  "hint.sleep_now": "睡吧",

  "ui.hand_busy": "手上端着东西呢，先起锅或者装盘",

  "ui.held.title": "手上",
  "ui.held.drop": "放回背包",
  "ui.held.eat": "吃掉",
  "ui.held.store": "收起来",

  // 背包分类页签。值来自 Core 的 ItemCategory，加一类物品只用在这儿补一行
  "ui.category.all": "全部",
  "ui.category.material": "材料",
  "ui.category.furniture": "家具",
  "ui.category.tool": "工具",
  "ui.category.food": "食物",
  "ui.category.quest": "任务",

  "ui.rarity.common": "常见",
  "ui.rarity.uncommon": "少见",
  "ui.rarity.rare": "稀有",
  "ui.rarity.epic": "珍贵",
  "ui.rarity.legendary": "传说",
  "ui.rarity.mythic": "神话",

  "ui.backpack.empty_title": "还没有选中东西",
  "ui.backpack.empty_hint": "点一下格子看看它是什么",
  "ui.backpack.take": "拿到手上",
  "ui.backpack.eat": "吃掉",
  "ui.backpack.capacity": "格子",
  "ui.backpack.sort": "整理",
  "ui.backpack.hint": "点击查看 · 拖到下面那排快捷栏 · Esc / B 关闭",
  "ui.backpack.filter_empty": "这一类还什么都没有",
};

export function t(key: string): string {
  return ZH[key] ?? key;
}

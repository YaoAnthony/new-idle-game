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
  "item.mystery_stew": "一锅乱炖",
  "item.mystery_stew.desc": "说不清放了什么，但确实是热的。吃得饱一点点。",

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

  // 教程收尾。剧情推倒后只剩这一个键（tutorialDefinition 还引着它），
  // 文案等新教程一起写
  "tutorial.completed": "（待写）",

  // 物品（M5 新增）
  "item.bedroll": "地铺",
  "item.bedroll.desc": "被子和枕头。第一天，就先睡地铺吧。",

  // 宠物：物种名 + 初见时给的默认昵称（玩家之后能改，存 PetSave.nickname）
  "pet.unknown": "小家伙",
  "pet.moss_wisp": "苔灵",
  "pet.moss_wisp.nickname": "苔苔",
  "pet.foam_wisp": "沫灵",
  "pet.foam_wisp.nickname": "沫沫",
  "pet.ember_wisp": "烬灵",
  "pet.ember_wisp.nickname": "小烬",
  "pet.shushu": "岩绒巨猫",
  "pet.shushu.nickname": "舒舒",

  // 送礼的四档反应。差别全在**反应**上，四档都不扣好感、四档都推进剧情——
  // 递错东西是了解它的过程，不该被惩罚（见 giftRules.ts）。
  // 不喜欢/不能吃这两档要写清「东西还在你手上」，否则玩家会以为白送了
  // 开场独白：搬进新家的第一分钟。三句话说明白"到家了""屋子是空的"
  // "先拆门口那两个箱子"，把玩家的第一个动作指出来

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
  "ui.loading.world": "正在加载您的世界...",
  // 需求条的标签。原来写死在 NeedsHud 组件里——用户可见文案不该躺在组件里，
  // ESC 菜单也要用同一份，写死的话两处迟早说不一样的词
  "ui.needs.hunger": "饱食",
  "ui.needs.fatigue": "精力",

  // 屋子风格。ESC 菜单拿它当标题，之前一条文案都没有，直接漏出了 key
  "room_style.forest_cottage": "林间小屋",
  "room_style.ocean_cottage": "海边小屋",
  "room_style.stone_cottage": "石砌小屋",

  // ESC 侧边菜单
  "ui.esc.title": "菜单",
  "ui.esc.backpack": "背包",
  "ui.esc.actions": "行动",
  "ui.esc.chat": "消息",
  "ui.esc.settings": "设置",
  "ui.esc.return_title": "回到标题",
  "ui.esc.current_action": "正在进行的行动",
  "ui.esc.no_action": "现在什么都没在做",
  "ui.esc.close_hint": "关闭菜单",

  // 家具交互气泡（走近时浮在家具上方）
  "hint.stove": "做饭",
  "hint.workbench": "制作家具",
  // 床是两步：先躺下，躺着再按 F 才睡觉
  "hint.bedroll": "躺一会儿",
  "hint.bed": "躺一会儿",
  "hint.bookshelf": "看看书",
  "hint.chest": "打开箱子",
  "hint.daily_board": "看看今天要做什么",
  "hint.daily_board_first_placed": "走近按 F，写点你想做的事",
  "hint.chair": "坐下歇会儿",
  "hint.stool": "坐下歇会儿",
  "hint.cushion": "坐下歇会儿",
  "hint.fireplace": "烤烤火",
  "hint.floor_lamp": "开灯 / 关灯",
  "hint.potted_plant": "浇点水",
  "ui.pickup_hint": "右键拿起",
  // 触摸操作的无障碍标签（屏幕上是图标，读屏器要读得出来）
  "ui.touch.interact": "交互",
  "ui.touch.throw": "扔出",
  "ui.touch.rotate": "转方向",
  "ui.cooking_in_progress": "烹饪中…",
  // 每日任务机器（V0.11）
  "ui.daily.title": "每日任务",
  "ui.daily.subtitle": "写下想做的事，每天抽几件",
  "ui.daily.pool_title": "我的清单",
  "ui.daily.pool_count": "清单里有 {count} 条",
  "ui.daily.pool_empty": "还什么都没写。写几条你想坚持的事吧。",
  "ui.daily.pool_full": "清单满了（上限 {limit} 条）",
  "ui.daily.add_placeholder": "比如：喝八杯水",
  "ui.daily.add": "加进清单",
  "ui.daily.today_title": "今天要做的",
  "ui.daily.today_short": "清单里再写几条，今天才凑得满",
  "ui.daily.done": "做完了",
  "ui.daily.reroll": "换一个",
  "ui.daily.reroll_used": "今天的换牌机会用过了",
  "ui.daily.reroll_no_spare": "清单里没有别的了，再写几条吧",
  "ui.daily.hud_title": "今日任务",
  "ui.daily.reward_ready": "机器动了一下…",
  // 消息面板
  "ui.chat.closed_hint": "回车说话 · / 开命令",
  "ui.chat.placeholder": "说点什么，或者用 / 开头敲指令…",
  "ui.chat.dismiss": "Esc 收起",

  // ---- 生活感扩充：物品 ----
  "item.furniture_bookshelf": "书架",
  "item.furniture_storage_chest": "储物箱",
  "item.furniture_daily_board": "每日任务板",
  "item.furniture_daily_board.desc": "写下想做的事，它每天挑几件提醒你。做完了会吐点什么出来。",
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
  "item.furniture_ofuro": "日式浴缸",
  "item.furniture_ofuro.desc": "木头箱子似的方缸，一侧是踏上去的高台。注满水、坐进去，一天的疲惫就松开了。",
  "hint.ofuro_empty": "注水",
  "hint.ofuro_filling": "注水中…",
  "hint.ofuro_full": "泡澡",
  "hint.ofuro_draining": "放水中…",
  "placement.fixed": "这是房子自带的，搬不走。",
  "item.furniture_lucky_bamboo": "富贵竹",
  "item.furniture_lucky_bamboo.desc": "白瓷盆里插着几根带节的富贵竹，长到半人高。据说能旺家。",
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

  // 箱庭地图（①B）
  "map.base": "玩家据点",
  // 六家店铺（店名同时是招牌上的字，见 Maps/town/shops.ts 的规格表）
  "map.shop_bookstore": "书店",
  "map.shop_arcane": "神秘商店",
  "map.shop_convenience": "便利店",
  "map.shop_cafe": "咖啡厅",
  "map.shop_restaurant": "餐厅",
  "map.shop_market": "超市",
  // 名字来自用户的世界设定图《莉奥拉小镇——宁静生活在等待》
  "map.town": "莉奥拉小镇",
  "item.furniture_garden_bench": "园林长椅",
  "item.furniture_garden_bench.desc": "铁艺扶手的板条长椅。坐在前庭看田，是据点生活的正确打开方式。",
  "item.furniture_street_lamp": "铁艺路灯",
  "item.furniture_street_lamp.desc": "黑铁灯柱，入夜自己亮起来。夜里回家的路是顺着灯走的。",
  "hint.garden_bench": "坐下歇歇",
  "ui.travel.moving": "移动中…",
  "ui.travel.in_session": "联机中不能离开这张地图",

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

  // 设置面板的五个标签页（照抄 Oldfrontend 的分区）
  "ui.settings.tab_world": "世界",
  "ui.settings.tab_audio": "声音",
  "ui.settings.tab_interface": "界面",
  "ui.settings.tab_controls": "控制",
  "ui.settings.tab_debug": "调试",

  // 世界
  "ui.settings.time": "时间",
  "ui.settings.phase_dawn": "清晨",
  "ui.settings.phase_day": "白天",
  "ui.settings.phase_dusk": "黄昏",
  "ui.settings.phase_night": "夜晚",
  "ui.settings.weather": "天气",
  "ui.settings.weather_auto": "跟随世界",
  "ui.settings.weather_auto_desc": "撤掉手动指定，交还给天气系统",
  "ui.settings.weather_sunny_desc": "风和日丽，光线通透",
  "ui.settings.weather_cloudy_desc": "云层压低，光被滤软",
  "ui.settings.weather_rain_desc": "静谧中雨，水汽弥漫",
  "ui.settings.weather_wind_desc": "风穿过屋子，草木都在动",
  "ui.settings.weather_storm_desc": "雷电交加，狂风大作",

  // 声音
  "ui.settings.music_now": "当前音乐",
  "ui.settings.music_none": "还没有在放",
  "ui.settings.music_mode": "播放模式",
  "ui.settings.music_sequential": "顺序",
  "ui.settings.music_shuffle": "乱序",
  "ui.settings.music_repeat_one": "单曲",

  // 界面
  "ui.settings.language": "语言",
  "ui.settings.lang_zh": "中文（简体）",
  "ui.settings.lang_zh_desc": "界面优先显示中文",
  "ui.settings.lang_ja": "日本語",
  "ui.settings.lang_ja_desc": "界面优先显示日文",
  "ui.settings.language_restart": "语言会在下次进入游戏时生效。",

  // 控制（键位重绑定）
  "ui.settings.rebind_hint": "点一下右边的键位，再按你想用的键。",
  "ui.settings.press_a_key": "按一个键…",
  "ui.settings.key_not_allowed": "这个键不能用来绑定，换一个试试。",
  "ui.settings.reset_keys": "恢复默认键位",
  "ui.settings.group_move": "移动与视角",
  "ui.settings.group_items": "交互与物品",
  "ui.settings.group_menu": "面板与输入",
  "ui.settings.action_moveUp": "向前走",
  "ui.settings.action_moveDown": "向后走",
  "ui.settings.action_moveLeft": "向左走",
  "ui.settings.action_moveRight": "向右走",
  "ui.settings.action_run": "奔跑",
  "ui.settings.action_jump": "跳",
  "ui.settings.action_interact": "交互",
  "ui.settings.action_throwItem": "扔出手上的东西",
  "ui.settings.action_dumpContainer": "倒掉锅里的",
  "ui.settings.action_rotatePlacement": "旋转家具",
  "ui.settings.action_backpack": "打开背包",
  "ui.settings.action_chat": "说话",
  "ui.settings.action_command": "输入指令",
  "ui.settings.action_debugMode": "调试面板",

  // 调试
  "ui.settings.commands": "可用指令",
  "ui.settings.commands_hint": "在游戏里按「输入指令」的键（默认 /）打开命令行。",

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
  "weather.fog": "大雾",

  // 音频（注册表里的 localizationKey，将来做音量面板分组用）
  "audio.ambience_forest_day": "森林（白天）",
  "audio.ambience_forest_night": "森林（夜晚）",
  "audio.ambience_sea": "海边",
  "audio.weather_rain": "雨声",
  "audio.weather_storm": "暴雨",
  "audio.thunder": "雷声",
  "audio.eat": "进食",
  "audio.unpack": "拆箱",
  // 下面这几条以前只在注册表里挂着、词典里没有——白噪音台要拿它们当行名，
  // 缺一条就露出 audio.fireplace 这种 id 给玩家看
  "audio.fireplace": "壁炉",
  "audio.cooking": "灶上",
  "audio.wall_clock": "挂钟",
  "audio.action_writing": "笔尖",
  "audio.storage_open": "开箱",

  // 音乐（白噪音台上归一条推子；曲名来自文件名，不进词典）
  "audio.music": "音乐",
  "item.furniture_gramophone": "唱片机",
  "item.furniture_gramophone.desc":
    "黄铜大喇叭的老式留声机。靠近能看到它在放什么，按一下换个放法。",
  // 唱片机气泡显示的就是当前模式；hint.gramophone 只是数据表兜底
  "hint.gramophone": "换个放法",
  "music.mode.sequential": "顺序播放",
  "music.mode.shuffle": "随机播放",
  "music.mode.repeat-one": "单曲循环",
  "hint.gramophone_insert": "放入唱片",
  // 拿取被挡（箱子没清空 / 台面上还摆着东西）。两种情况一句话说完
  "placement.not_empty": "先把里面和上面的东西收走，才能搬动它",
  "music.record_swapped": "换上了 ",
  "music.record_already_in": "这张唱片已经在放了",
  "item.record_animal_crossing": "唱片·集落原声",
  "item.record_animal_crossing.desc":
    "一张旧黑胶，封套上画着海岛的清晨。塞进唱片机就能换一整柜子的歌。",
  "item.record_minecraft": "唱片·方块摇篮曲",
  "item.record_minecraft.desc":
    "封套是一片像素的草原。放出来的曲子安静得像在挖一条很深的矿道。",

  // 白噪音台（专注时左边那块）
  "ui.mixer.title": "白噪音",
  "ui.mixer.hint": "只影响你自己",
  "ui.mixer.empty": "周围很安静",
  "ui.mixer.mute": "静音",
  "ui.mixer.unmute": "取消静音",

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
  // 触摸版：去掉 Esc / B（手机上没这两个键），关闭改指右上角那个 ✕
  "ui.backpack.hint_touch": "点一下查看 · 拖到下面那排快捷栏 · 右上角 ✕ 关闭",
  "ui.backpack.filter_empty": "这一类还什么都没有",

  "audio.door_open": "开门声",
  "audio.door_close": "关门声",

  // ---- 门 ----
  "door.front_door": "大门",
  "door.room_door": "房门",
  "door.hint.open": "开门",
  "door.hint.close": "关门",
  // 推不开时的旁白。不预告"锁着"，让玩家自己推一下才发现
  "door.locked_feedback": "你推了推门——似乎锁住了。",

  // ---- 捏脸 ----
  "ui.creator.title": "捏一个自己",
  "ui.creator.back": "回标题",
  "ui.creator.confirm": "出发",
  "ui.creator.drag_hint": "拖动转视角 · 滚轮拉近拉远",
  "ui.creator.drag_hint_touch": "拖动转视角 · 双指捏合拉近拉远",
  "ui.creator.reset_view": "回正",

  "avatar.slot.face": "脸型",
  "avatar.slot.hair": "发型",
  "avatar.slot.eyes": "眼睛",
  "avatar.slot.mouth": "嘴巴",
  "avatar.slot.nose": "鼻子",
  "avatar.slot.top": "上衣",
  "avatar.slot.bottom": "下装",
  "avatar.slot.shoes": "鞋子",

  "avatar.color.skin": "肤色",
  "avatar.color.hair": "发色",
  "avatar.color.eyes": "瞳色",
  "avatar.color.top": "上衣颜色",
  "avatar.color.bottom": "下装颜色",
  "avatar.color.shoes": "鞋子颜色",

  "avatar.part.body_default": "标准身形",
  "avatar.part.face_round": "圆脸",
  "avatar.part.face_oval": "鹅蛋脸",
  "avatar.part.face_chubby": "包子脸",
  "avatar.part.hair_bob": "波波头",
  "avatar.part.hair_short": "清爽短发",
  "avatar.part.hair_spiky": "小刺头",
  "avatar.part.hair_ponytail": "马尾",
  "avatar.part.hair_buns": "双丸子",
  "avatar.part.hair_curly": "蓬蓬卷",
  "avatar.part.eyes_round": "圆眼",
  "avatar.part.eyes_oval": "杏眼",
  "avatar.part.eyes_happy": "眯眯眼",
  "avatar.part.eyes_sleepy": "困困眼",
  "avatar.part.mouth_smile": "微笑",
  "avatar.part.mouth_open": "咧嘴笑",
  "avatar.part.mouth_neutral": "抿嘴",
  "avatar.part.mouth_cat": "猫猫嘴",
  "avatar.part.nose_triangle": "小三角",
  "avatar.part.nose_round": "圆鼻头",
  "avatar.part.nose_dot": "小点点",
  "avatar.part.top_dress": "连衣裙",
  "avatar.part.top_shirt": "衬衫",
  "avatar.part.top_hoodie": "卫衣",
  "avatar.part.bottom_plain": "长裤",
  "avatar.part.bottom_shorts": "短裤",
  "avatar.part.bottom_skirt": "短裙",
  "avatar.part.shoes_plain": "布鞋",
  "avatar.part.shoes_boots": "小靴子",
};

export function t(key: string): string {
  return ZH[key] ?? key;
}

/**
 * 这个键有没有文案。给注册表自检用（见 main.tsx 的 auditStoryContent）。
 *
 * `t()` 查不到会原样返回键名，界面上就是一串 `story.pet_promise`——
 * 不报错、不留空，所以只靠玩是发现不了的，得在开机时点名。
 */
export function hasLocalizationKey(key: string): boolean {
  return key in ZH;
}

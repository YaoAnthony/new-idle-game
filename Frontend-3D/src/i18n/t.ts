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
  "item.furniture_nightstand": "床头柜",
  "item.furniture_workbench": "普通工作台",
  "item.furniture_table": "木桌",
  "item.furniture_chair": "木椅",
  "item.furniture_rug": "圆地毯",
  "item.furniture_dumbbell": "哑铃",
  "item.tomato": "番茄",
  "item.tomato_seed": "番茄种子",
  "item.tomato_seed.desc": "一小包种子。撒进田里，它自己会长。",

  // ---- 建筑（期 2）。型号名不带等级，等级名各自带 ----
  "building.gold_jar": "金库",
  "building.gold_jar.desc": "存金币的地方。里头有多少就是你有多少——装满了，进账的部分会流失。",
  "building.gold_jar.l1": "金库",
  "building.gold_jar.l1.desc": "围一圈木栅栏的石台，正面下三级台阶，正中供着一口上锁的铁箱。",
  "building.gold_jar.l2": "金库 · 加固",
  "building.gold_jar.l2.desc": "台子大了一圈，栏杆加到三道，柱头全包了铁。",
  "building.gold_jar.l3": "金库 · 高台",
  "building.gold_jar.l3.desc": "整座台子又垫高一层，箱子被供在上面，装得下相当可观的一笔钱。",
  "building.farm_plot": "农田",
  "building.farm_plot.desc": "一块翻好的地。手上拿着种子走过去按 F 就能种。",
  "building.farm_plot.l1": "农田",
  "building.farm_plot.l1.desc": "木框围出的一块土地，四角木桩。",
  "building.land_cabin": "陆地小屋",
  "building.land_cabin.desc": "给特别的小动物住的小木屋。走得进去。",
  "building.land_cabin.l1": "陆地小屋",
  "building.land_cabin.l1.desc": "坡顶小木屋，一扇给动物的小门，窗里透光。",
  "building.house": "房子",
  "building.house.desc": "住的地方。加建之后可以往两个方向走：摊开，或者长高。",
  "building.house.l1": "木屋",
  "building.house.l1.desc": "单坡顶小木屋，一扇门一扇窗。",
  "building.house.l2": "木屋 · 加建",
  "building.house.l2.desc": "多了一间偏厦、一根烟囱、门前一步台阶。",
  "building.house.l3a": "石造宅",
  "building.house.l3a.desc": "石墙木构，双坡瓦顶，正面一道门廊。宽敞。",
  "building.house.l3b": "塔屋",
  "building.house.l3b.desc": "占地没变，人往上走：三层塔身顶着一圈观景平台。屋里是挑高的一间。",

  // ---- 领地地块（期 1；2026-08-22 从 A1..D3 的均匀格盘换成手写的地块表）----
  "territory.plot.home": "家院",
  "territory.plot.west_meadow": "西边草地",
  "territory.plot.south_bank": "西南滩地",
  "territory.plot.northwest_wood": "西北林子",
  "territory.plot.north_yard": "北面老宅地",
  "territory.plot.north_grove": "北面小树林",
  "territory.plot.east_grove": "东边树丛",
  "territory.plot.east_bridge": "东岸桥头",

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
  "furniture.well": "石井",

  // ---- 石傀儡（2026-08-22）----
  "pet.stone_golem": "石傀儡",
  "pet.stone_golem.nickname": "石头",
  "item.golem_head": "石傀儡的头",
  "hint.golem_head": "捡起来",
  "golem.hint.attach": "装上头",
  "golem.hint.dormant": "一尊没有头的石像",
  "golem.hint.build": "看看能盖什么",
  "golem.awakened": "石头缝里亮起一道光。它撑着地站了起来。",
  "item.blueprint_gold_jar": "金库图纸",
  "item.blueprint_wood_wall": "木墙图纸",
  "building.wood_wall": "木墙",
  "building.wood_wall.desc": "一格一段，挨着的会自己连起来。",
  "building.wood_wall.l1": "木墙",
  "building.wood_wall.l1.desc": "几根木杆扎的栅栏，挡得住脚步挡不住风。",
  "building.wood_wall.l2": "木墙 · 加固",
  "building.wood_wall.l2.desc": "料更足、更高，柱头包了铁箍。",
  "material.gold": "金币",
  // 牌匾是**名词**：它标的是"这是谁的铺子"，不是跟玩家搭话。
  // 原来写的是「要盖点什么」——一句问话，每次开面板都问一遍，读第二次就多余了。
  // 和另外两个商人同一个命名法（阿獭的收购摊 / 泡泡的浮筏摊）
  "ui.build_shop": "石傀儡的工坊",
  // 确认框上那个按钮。原来这句是印在**每张卡底下**的（「要图纸」），
  // 一屏六张卡就重复六遍；现在挪到确认框里，说一次，而且是在玩家真要掏钱那一刻
  "ui.build_shop.buy": "买下",
  "ui.build_shop.free": "不要材料",
  "ui.build_shop.empty": "他现在什么也盖不了。",
  "ui.build_shop.hint": "拿上图纸，走到想盖的地方按 F。",
  // ---- 确认框 ----
  // 「点一下就扣钱」在这块面板上尤其伤：地块是不可撤销的，图纸也退不掉
  "ui.build_shop.confirm.cancel": "再想想",
  /*
   * 确认框里**没有说明文字**。
   *
   * 这里一度写过「买到手的是图纸。拿上它走到想盖的地方按 F……」，
   * 用户当场否掉：游戏界面不是说明书。那件事货架底下那行
   * `ui.build_shop.hint` 已经常驻讲着，讲一次就够；
   * "钱够不够"由价钱标红和按钮变灰讲，不用字。
   */
  /*
   * 买完那条绿条上的后半句。**建筑和地块必须分开说**：
   * 买图纸是往背包里放一件东西，开地是当场把地圈进来、背包里什么都没多。
   * 共用一句的话，开完地会看到"放进背包了"——玩家会去背包里找那块地。
   */
  "ui.build_shop.bought": "图纸放进背包了",
  "ui.build_shop.territory.opened": "开好了",
  // 左边分类栏那两格。**是名词不是动词**——它标的是"这一格里是什么"，
  // 按下去不发生任何事，只是换一架货
  "ui.build_shop.tab.build": "建筑",
  "ui.build_shop.tab.terrain": "地形",
  // 扩地也在石傀儡这儿办：他是这块地上唯一会动土的
  "ui.build_shop.territory": "开一块新地",
  "ui.build_shop.territory.hint": "挑一块挨着的地，石头这就去推界桩。",
  "ui.build_shop.territory.buy": "叫他去敲",
  "ui.build_shop.territory.none": "挨着的地都是你的了。",
  // t() 不支持插值，地名在代码里拼在前面："西边草地那边的界桩倒了……"
  "ui.build_shop.territory.done": "那边的界桩倒了——石头抡起锤子，把地圈了进来。",
  "build.in_progress": "施工中",
  "build.queued": "等着开工",
  "build.hint.site": "施工中",
  "build.hint.manage": "看看这栋",
  "build.panel.overview": "概览",
  "build.panel.stored": "存了",
  "build.panel.max": "已经是最高等级了。",
  "build.panel.working": "正在施工，先让它建完。",
  "build.panel.upgrade_to": "升到",
  "build.panel.name": "名称",
  "build.panel.about": "介绍",
  "build.panel.staff": "员工",
  "build.panel.staff_none": "还没有员工",
  "build.panel.plans": "升级方案",
  "build.panel.no_art": "施工图还没画好",
  "build.panel.upgrade": "升级",
  "build.panel.move": "迁移",
  "build.panel.remove": "拆除",
  "build.remove.not_empty": "里面还有东西，先搬空再拆。",
  "build.remove.failed": "拆不了。",
  "build.upgrade.missing": "材料不够。",
  "build.upgrade.not_empty": "屋里还有家具，先搬空再升级。",
  "build.upgrade.failed": "现在升不了。",
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
  "pet.otter_trader": "水獭商人",
  "pet.otter_trader.nickname": "阿獭",
  "pet.coin_dragon": "灵渊小龙",
  "pet.coin_dragon.nickname": "青涟",
  // ---- 期 4 · 三位居民 ----
  "pet.slime_neighbor": "果冻史莱姆",
  "pet.slime_neighbor.nickname": "咕噜",
  "pet.fox_neighbor": "红尾小狐",
  "pet.fox_neighbor.nickname": "阿茜",
  "pet.spirit_neighbor": "林间精灵",
  "pet.spirit_neighbor.nickname": "薇尔",

  "item.blueprint_slime_house": "咕噜的家·图纸",
  "item.blueprint_fox_house": "阿茜的家·图纸",
  "item.blueprint_spirit_house": "薇尔的家·图纸",

  "building.diner": "餐厅",
  "building.diner.desc": "有灶有座的地方，院子才算有了人味。",
  "building.diner.l1": "1 级餐厅",
  "building.diner.l1.desc": "九乘七格，一口炖着的锅，门口两张露天桌。",
  "building.furniture_shop": "家具小店",
  "building.furniture_shop.desc": "邻居们想买你做的家具，于是有了这间铺子。",
  "building.furniture_shop.l1": "家具小店",
  "building.furniture_shop.l1.desc": "六个货位，一顶红雨棚。摆上去，明早就有人买走。",
  "building.furniture_shop.l2": "家具小店（扩建）",
  "item.blueprint_furniture_shop": "家具小店图纸",
  "item.watering_can_wide": "广口水壶",
  "item.furniture_news_printer": "报纸打印机",
  "ui.news": "今日报纸",
  "ui.news.none": "还没有报纸。把打印机送给薇尔，明天早上就有第一期。",
  "ui.news.default_name": "无名",
  "ui.news.masthead_suffix": " 晨报",
  "ui.news.issue_no": "第 {n} 期",
  "ui.news.cut_caption": "本报插图",
  "ui.news.weather": "天 气",
  "ui.news.span": "（本报隔了 {n} 天才印出来）",
  "ui.news.neighbors": "邻居动态",
  "ui.news.neighbors_quiet": "大家都没什么动静。",
  "ui.news.headline": "头 条",
  "ui.news.actions": "昨日行动",
  "ui.news.actions_none": "昨天一件事也没记下。",
  "ui.news.market": "市场行情",
  "ui.news.market_line": "进账 {in} 枚，支出 {out} 枚。",
  "ui.news.ad": "【广告】水獭这回想收：",
  "ui.news.ad_none": "今天他什么都不特别想要。",
  "ui.news.someone": "某位邻居",
  "ui.news.line.shop_sold": "{who} 买走了你的{what}",
  "ui.news.line.moved_in": "{who} 搬来了",
  "ui.news.line.restaurant_served": "有人在你的餐厅吃了一顿",
  "ui.news.headline.quiet": "昨天很安静，什么也没发生",
  "ui.news.headline.quiet_span": "这 {n} 天里，家里静悄悄的",
  "ui.news.headline.theft": "金库失窃！有东西溜进了院子",
  "ui.news.headline.theft_settled": "失物追回，贼被押到了院子里",
  "ui.news.headline.resident_moved_in": "新邻居搬来了",
  "ui.news.headline.building_completed": "新楼落成",
  "ui.news.headline.traveler_visit": "浮筏车又停在了水边",
  "ui.news.headline.shop_sold": "小店昨天做成了生意",
  "ui.news.headline.action_completed": "又是踏实的一天",
  "dlg.reporter_names_the_paper": "薇尔和那台机器",
  "dlg.reporter_names_the_paper.n1": "……这是印刷机？真的印刷机？",
  "dlg.reporter_names_the_paper.n2": "我在书上见过图，从没想过能摸到一台。",
  "dlg.reporter_names_the_paper.n3": "那我每天把这儿发生的事印出来吧。大家都想知道，只是没人写。",
  "dlg.reporter_names_the_paper.n4": "得先取个名字才行——报头空着的报纸，那不叫报纸。",
  "ui.trade.peddler": "泡泡的浮筏摊",
  "ui.trade.sold_out": "售罄",
  "ui.trade.peddler.hint": "他八天才来一趟，摊上每样只有一件——错过就等下一回。",
  "pet.fish_trader": "小鱼人",
  "pet.fish_trader.nickname": "泡泡",
  "building.furniture_shop.l2.desc": "铺面宽了一圈，十二个货位——能撑更久没人看店。",
  "build.panel.shelf": "摆货上架",
  "hint.shop_crate": "上架摆货",
  "hint.shop_register_claim": "领取收益",
  "hint.shop_register_empty": "收银台 · 还没有进账",
  "hint.shop_register_vault_full": "收银台 · 金库满了，先建或升级金库",
  "ui.shelf.forecast": "预计",
  "ui.shelf.title": "货架",
  "ui.shelf.shelf": "架上",
  "ui.shelf.worth": "架上这些值",
  "ui.shelf.budget": "今天客人带了",
  "ui.shelf.hint": "点一下在货架和背包之间搬。比客人钱包还贵的，留给水獭吧。",
  "dlg.residents_ask_for_shop": "邻居们的请求",
  "dlg.residents_ask_for_shop.r1": "嘿，正好碰上你。我们三个昨天聊起来——",
  "dlg.residents_ask_for_shop.r2": "你屋里那些东西，是你自己做的吧？咕噜盯着你那把椅子看了三天了。",
  "dlg.residents_ask_for_shop.r3": "所以我们商量了一下：你要是开间铺子，把做出来的摆上去，我们天天都来。",
  "dlg.residents_ask_for_shop.r4": "图纸给你画好了。别嫌简陋，有个雨棚就够了——反正下雨我们也会来。",
  "building.slime_house": "咕噜的家",
  "building.slime_house.desc": "圆滚滚的住户配一栋圆滚滚的小屋。",
  "building.slime_house.l1": "咕噜的家",
  "building.slime_house.l1.desc": "屋顶是果冻绿的。窗里透着光，就说明他在家。",
  "building.fox_house": "阿茜的家",
  "building.fox_house.desc": "门口总是干干净净——她说尾巴会扫。",
  "building.fox_house.l1": "阿茜的家",
  "building.fox_house.l1.desc": "橘色屋顶，晒得到下午的太阳。",
  "building.spirit_house": "薇尔的家",
  "building.spirit_house.desc": "屋檐下挂着风铃，风一过就轻轻响。",
  "building.spirit_house.l1": "薇尔的家",
  "building.spirit_house.l1.desc": "淡紫的屋顶。她说颜色是跟晚霞借的。",

  "dlg.slime_asks_to_stay": "咕噜想住下来",
  "dlg.slime_asks_to_stay.s1": "唔……你好。这里，软软的，草是软的，风也是软的。",
  "dlg.slime_asks_to_stay.s2": "你把这里拾掇得真好看。咕噜……可以住下来吗？",
  "dlg.slime_asks_to_stay.s3": "这个给你——咕噜的家的图纸！盖好了咕噜就搬过来，嘿嘿。",
  "dlg.slime_casual.c1": "唔……今天也是软软的一天。",
  "dlg.slime_casual": "咕噜的寒暄",

  "dlg.fox_asks_to_stay": "阿茜想住下来",
  "dlg.fox_asks_to_stay.f1": "哟！我打河对岸就瞧见这块地了——收拾得漂亮啊，比镇上的院子还利索！",
  "dlg.fox_asks_to_stay.f2": "直说了吧：我想搬过来。邻居嘛，热闹点总比冷清好，你说是不是？",
  "dlg.fox_asks_to_stay.f3": "图纸我都画好了，喏！等房子一起来，我立马拎包入住！",
  "dlg.fox_casual.c1": "今天有什么新鲜事？没有？那我讲一个——",
  "dlg.fox_casual": "阿茜的寒暄",

  "dlg.spirit_asks_to_stay": "薇尔想住下来",
  "dlg.spirit_asks_to_stay.p1": "打扰了。我从林子里来——沿路的草都被照料过，是你做的吧？",
  "dlg.spirit_asks_to_stay.p2": "被照料的土地会发光，你大概看不见，但我们看得见。我想在这样的光旁边住下来。",
  "dlg.spirit_asks_to_stay.p3": "这是我家的图样，请收下。等它落成，我会带着我的风铃来。",
  "dlg.spirit_casual.c1": "今天的光也很好。谢谢你照料这里。",
  "dlg.spirit_casual": "薇尔的寒暄",

  // ---- 期 3 · 商人与偷窃（名字键在上面，另一个会话先加的） ----
  "event.gold_theft": "金库失窃",
  "event.gold_theft.eyed": "金库落成了，似乎有什么盯上了它",
  "event.gold_theft.robbed": "金库里少了几枚金币",
  "event.gold_theft.chasing": "水獭商人去追那个贼了",
  "event.gold_theft.caught": "小龙被抓回来了",
  "event.gold_theft.settled": "这件事了结了",

  "toast.gold_stolen": "金库的盖子敞着——里面少了几枚金币！",

  "dlg.otter_first_meet": "水獭上门",
  "dlg.otter_first_meet.n1": "打扰啦！我在河上就瞧见了——一条小龙抱着几枚金币，一头扎进上游的水洞。那亮闪闪的，是你家的吧？",
  "dlg.otter_first_meet.n2": "那家伙就爱亮晶晶的玩意儿，跑不远。要不要我去把它逮回来？",
  "dlg.otter_first_meet.help": "麻烦你了，帮我把它逮回来吧",
  "dlg.otter_first_meet.waive": "算了，几枚金币而已，不用管它",
  "dlg.otter_first_meet.n3": "包在我身上！明天这时候，连龙带钱一起给你带回来。",
  "dlg.otter_first_meet.n4": "哦？你倒是大方。那就当没这回事——对了，我收家具，那边世界的物件我见着就走不动道。往后隔三天来一趟，有货尽管找我！",

  "dlg.dragon_caught": "被抓回来的小龙",
  "dlg.dragon_caught.d1": "呜……人家、人家只是想借几枚亮亮的嘛……",
  "dlg.dragon_caught.d2": "（它把爪子绞在胸前，尾巴尖不安地一卷一卷。）",
  "dlg.dragon_caught.d3": "……对不起。明天、明天就还你。",

  "dlg.otter_returns": "物归原主",
  "dlg.otter_returns.r1": "喏，一枚不少！那家伙的水洞里全是亮闪闪的小玩意儿，就你这几枚最新。",
  "dlg.otter_returns.r2": "说正经的——你屋里那些家具，卖我点儿呗？我隔三天来一趟，见着想要的货还加价收。就这么说定了！",

  "dlg.otter_casual": "水獭的寒暄",
  "dlg.otter_casual.c1": "转了一圈，还是你这儿的物件最有意思。摊子摆着呢，随时来。",

  "ui.trade": "阿獭的收购摊",
  "ui.trade.tab.sell": "卖货",
  "ui.trade.tab.buy": "进货",
  "ui.trade.wanted": "想要！",
  "ui.trade.sell.empty": "背包里没有能卖的东西——去做点行动，开出来的家具他都收",
  "ui.trade.sell.hint": "点一下卖一件。戴着「想要！」的这回加价收",
  "ui.trade.buy.hint": "食材和材料。能种的自己种，这里卖的是你种不出来的",

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
  // 灯的气泡按开关状态换词（照 door.hint.open/close 的先例）：
  // _off = 现在是灭的，按 F 会点亮；_on = 现在亮着，按 F 会熄
  "hint.floor_lamp_off": "开灯",
  "hint.floor_lamp_on": "关灯",
  "hint.street_lamp_off": "点亮路灯",
  "hint.street_lamp_on": "熄灭路灯",
  "hint.moon_lamp_off": "开灯",
  "hint.moon_lamp_on": "关灯",
  "hint.mushroom_lamp_off": "开灯",
  "hint.mushroom_lamp_on": "关灯",
  "hint.cloud_lamp_off": "开灯",
  "hint.cloud_lamp_on": "关灯",
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
  /*
   * 右栏（今天要做的）**不能复用左栏那句**。两栏并排显示一模一样的
   * "还什么都没写"，读起来像同一个组件渲染了两遍——而它们讲的其实是
   * 两件事：左边是"清单空着"，右边是"清单空着所以今天没抽出东西"。
   */
  "ui.daily.today_empty": "清单里写几条，今天就有得抽了。",
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
  // ---- 桌灯三件套（2026-08-23）。描述里都点一句"自己亮"，
  //      因为按 F 对它们没反应——文案是玩家唯一能知道这件事的地方 ----
  "item.furniture_moon_lamp": "月牙灯",
  "item.furniture_moon_lamp.desc": "一弯月牙浮在黄铜细杆上，底座边还落着两颗掉下来的星星。天黑了它自己亮。",
  "item.furniture_mushroom_lamp": "蘑菇灯",
  "item.furniture_mushroom_lamp.desc": "奶白伞盖点着几粒红斑，光从伞里透出来。摆桌角，像屋里长出来一朵。",
  "item.furniture_cloud_lamp": "云朵灯",
  "item.furniture_cloud_lamp.desc": "一朵胖云挂在杆头，底下垂着三滴会发光的雨。写字的时候有云在旁边。",

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
  "ui.action.unlocked_hint": "新功能已解锁",

  "ui.action.pick_entry": "选择一个现实里要做的行动",
  "ui.action.add": "添加行动",
  "ui.action.empty_title": "还没有行动",
  "ui.action.empty_hint": "先添加一个你现实里想做的事",
  /*
   * 空态要讲清楚**两种用法**，因为这一屏正是玩家第一次决定"我要怎么用
   * 这个系统"的地方——而它有两条路：先计划（写下来、坐下来做）和
   * 事后记录（做完了回头记一笔）。只写"先添加一个"的话，记录型的人
   * 会以为自己得先假装计划一遍。
   */
  "ui.action.empty_two_ways":
    "写下想做的事，坐下来做完它；或者做完了再回来记一笔——两种拿到的一样多。",
  "ui.action.list_footer_empty":
    "添加后会出现在这里，点击开始后角色会在房间里使用家具行动",
  "ui.action.list_footer": "开始后，角色会在房间里使用家具行动",
  "ui.action.start": "开始",
  /*
   * 事后补记（P 路径）的文案。
   *
   * 「开始」和「已经做完了」是**同一张表单的两个出口**：计划型的人写好
   * 条目坐下来做，记录型的人做完了才回头记一笔。两者拿一样的奖励，
   * 区别只在结算发生在做之前还是做之后。
   */
  "ui.action.log_done": "已经做完了",
  "ui.action.log_row": "记一笔",
  "ui.action.log_quota": "今天还能补记 {left} 件",
  "ui.action.log_quota_out": "今天的补记额度用完了",
  "ui.action.log_hint": "没开计时器也做完了的事，记一笔照样算",
  "ui.action.log_fail_count": "今天的补记额度用完了，明天见",
  "ui.action.log_fail_minutes": "今天补记的总时长到顶了",
  "ui.action.log_fail_busy": "手上还有进行中的行动",
  "ui.action.log_fail_tired": "精力不够。补记和亲手做扣一样的精力",
  "ui.action.log_fail_unknown": "找不到对应的行动",
  "ui.action.log_fail_duration": "时长超出这类行动的范围",
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

  // ---- 系列任务（行动链）----
  "ui.chain.title": "系列任务",
  "ui.chain.tab_view": "查看",
  "ui.chain.tab_edit": "编辑",
  "ui.chain.new": "新建系列任务",
  "ui.chain.create": "创建",
  "ui.chain.empty_title": "还没有系列任务",
  "ui.chain.empty_hint": "把一个大目标拆成一个个小任务，做完一个解锁下一个",
  "ui.chain.pick_one": "从左边选一条系列任务",
  "ui.chain.archived": "已完成",
  "ui.chain.done_suffix": "已结项",
  "ui.chain.add_node": "添加任务",
  "ui.chain.no_nodes": "还没有任务，先添加第一件要做的事",
  "ui.chain.group_available": "可以做",
  "ui.chain.group_locked": "还锁着",
  "ui.chain.group_completed": "已完成",
  "ui.chain.needs": "要先做完",
  "ui.chain.delete_confirm": "确认删除（连同 {n} 个任务）",
  "ui.chain.form_title": "这条系列任务叫什么",
  "ui.chain.form_title_placeholder": "例如：期末冲刺",
  "ui.chain.form_desc": "写点说明",
  "ui.chain.form_desc_placeholder": "为什么要做这件事",
  "ui.chain.form_icon": "图标",
  "ui.chain.form_color": "颜色",
  "ui.chain.form_note": "写点说明",
  "ui.chain.form_note_placeholder": "给自己的提示",
  "ui.chain.form_requires": "前置",
  "ui.chain.form_requires_hint": "勾中的全部做完，这个任务才解锁；全不勾=起点",
  "ui.chain.save_node": "保存任务",
  "ui.chain.edit_node": "编辑任务",
  "ui.chain.delete_node": "删除",
  "ui.chain.delete_node_confirm": "确认删除（下游自动接上）",
  "ui.chain.would_cycle": "勾了会绕成一圈，先解开另一头",
  "ui.chain.tidy": "一键整理",
  "ui.chain.edit_hint":
    "拖任务摆位置 · 拖任务右侧的→到另一个任务连前置 · 点线删线 · 点任务改内容",
  "ui.chain.tap_again_delete": "再点一下删除这条线",
  "ui.chain.view_hint": "点任务查看 · 拖空白平移 · 滚轮/双指缩放",
  "ui.chain.pick_node_hint": "点树上的任务查看详情、开始行动",

  // 开箱面板
  "ui.chest.node_done": "完成了一个任务！",
  "ui.chest.chain_done": "整条系列任务做完了！",
  "ui.chest.tap_close": "点任意处收下",
  "ui.chain.optional": "（可不填）",
  "ui.chain.entry": "系列任务",

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
  "audio.bath_water": "浴缸水声",
  "audio.wall_clock": "挂钟",
  "audio.action_writing": "笔尖",
  "audio.storage_open": "开箱",
  "audio.chest_drop": "宝箱落地",
  "audio.chest_open": "宝箱开盖",

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

## 我爱星冰乐 游戏介绍
这是一个拼手气的游戏，在“我”，“爱”，“星”，“冰”，“乐”五个字中投注一个或多个，满5人即开奖，奖金按照中奖者的投注比例瓜分。 奖池中只有80%用于瓜分，其余扣除平台费后转入下一期奖池。

## 我爱星冰乐 合约使用说明
* bid
  - 说明：用于投注
  - 参数：“我”，“爱”，“星”，“冰”，“乐”中的任意一个字
  - 无返回


* getCurrentPeriod
  - 说明：获取当前期数
  - 返回：数值字符

* getPlayerCount
  - 说明：获取当前竞猜人次 （若同一期，一人投多次，按多次算）
  - 返回：数值字符

* getNasInPool
  - 说明：获取当前奖池金额，换算成NAS
  - 返回：数值字符

* getCurrentUserBidHistory
  - 说明：获取当前用户投注历史最近20条记录
  - 返回：{bidAmount:''，bidTarget:'', period:x}
         其中bidAmount为下注NAS数量，，bidTarget为下注的汉字，period为对应的期数

* getHistoryResultOverview
  - 说明：获取历史开奖记录，最近20条记录
  - 返回：{period : x, openResult: '', winnersCount: y, totalRewardAmount: z}
         其中period为开奖期数，openResult为开出的汉字，winnersCount为投中者数量，totalRewardAmount为总奖金


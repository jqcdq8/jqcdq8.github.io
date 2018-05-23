/**
 * Created by chenjihu on 2018/5/19.
 */
'use strict';

var Result = function (jsonStr) {
    if (jsonStr) {
        var obj = JSON.parse(jsonStr);
        this.winners = obj.winners;  //中奖人
        this.openResult = obj.openResult;  //开奖结果
        this.totalRewardAmount = obj.totalRewardAmount;  //瓜分的奖金额
        this.commission = obj.commission; //平台佣金
        this.remainNas = obj.remainNas;  //奖池剩余额度
    } else {
        this.winners = [];
        this.openResult = "";
        this.totalRewardAmount = 0;
        this.commission = 0;
        this.remainNas = 0;
    }
};

Result.prototype = {
    toString: function() {
        return JSON.stringify(this);
    }
};

var BidContent = function(jsonStr) {
    if (jsonStr) {
        var obj = JSON.parse(jsonStr);
        this.address = obj.address;  //下注人地址
        this.bidAmount = obj.bidAmount;  //下注数量
        this.bidTarget = obj.bidTarget; //下注目标，"我"，"爱"，"星"，"冰"，"乐"
        this.period = obj.period; //参与的期数
    } else {
        this.address = "";
        this.bidAmount = new BigNumber(0);
        this.bidTarget = "";
        this.period = 0;
    }
};

BidContent.prototype = {
    toString: function() {
        return JSON.stringify(this);
    }
};

var xblContract = function() {
    LocalContractStorage.defineProperty(this, "playerCount"); //当前玩家数量
    LocalContractStorage.defineProperty(this, "commissionRate");  //平台手续费率
    LocalContractStorage.defineProperty(this, "rewardRate");  //当期奖池用于发奖比例
    LocalContractStorage.defineProperty(this, "firePoint");   //活动触发点
    LocalContractStorage.defineProperty(this, "currentPeriod"); //当前期数
    LocalContractStorage.defineProperty(this, "nasInPool"); //奖池中的NAS数量
    LocalContractStorage.defineProperty(this, "minNasToJoin"); //参与活动必须满足最小的NAS投注量
    LocalContractStorage.defineProperty(this, "bidTargets"); //押注的对象，目前是 "我","爱", "星"，"冰"，"乐"
    LocalContractStorage.defineProperty(this, "adminAddress"); //管理员账户地址
    LocalContractStorage.defineProperty(this, "commissionAddress"); //手续费收款地址

    LocalContractStorage.defineMapProperty(this, "pool", { //奖池，有上限，人次到达后开奖
        parse: function(jsonStr) {
            return new BidContent(jsonStr);
        },
        stringify: function(obj) {
            return obj.toString();
        }
    });

    LocalContractStorage.defineMapProperty(this, "userBidHistory", { //用户参加活动历史
        parse: function(jsonText) {
            return JSON.parse(jsonText);  //是个数组对象字符串
        },
        stringify: function(obj) {
            return JSON.stringify(obj);
        }
    });

    LocalContractStorage.defineMapProperty(this, "historyResults", { //历届中奖结果
        parse: function(jsonText) {
            return new Result(jsonText);
        },
        stringify: function(obj) {
            return obj.toString();
        }
    });
};

xblContract.prototype = {

    init: function () {
        this.playerCount = 0;
        this.bidTargets = ["我","爱","星","冰","乐"];
        this.currentPeriod = 1;
        this.firePoint = 5;
        this.minNasToJoin = 0.5;
        this.commissionRate = 0.02;
        this.rewardRate = 0.8;
        this.nasInPool = new BigNumber(0);
        this.adminAddress = "n1a9vVHjSc1hwfebqHcHsf4MhMpm6SVCCc7";
        this.commissionAddress = "n1a9vVHjSc1hwfebqHcHsf4MhMpm6SVCCc7";
    },
    
    bid: function (target) {
        var from = Blockchain.transaction.from;
        var value = Blockchain.transaction.value;

        if (this.bidTargets.indexOf(target) === -1) {
            throw new Error("请选择下注对象");
        }

        if (value < this.minNasToJoin * 1000000000000000000) {
            throw new Error("选定下注对象后，至少投" + this.minNasToJoin + " NAS");
        }
        var bidContent = new BidContent();
        bidContent.address = from;
        bidContent.bidTarget = target;
        bidContent.bidAmount = new BigNumber(value/1000000000000000000); //单位换算成NAS
        bidContent.period = this.currentPeriod;
        this.playerCount += 1;

        if(this.playerCount > this.firePoint) {
            //打款超标，发生异常后，款项会被Nebulas退回，不用主动退款
            //this._refund(bidContent.address, bidContent.bidAmount);
            throw new Error("已经超出本期募集名额上线，款项原路返回");
        }

        if(this.playerCount <= this.firePoint) {
            this.pool.put(this.playerCount, bidContent);
            var currentUserBidHistory = this.getCurrentUserBidHistory();
            currentUserBidHistory.push(bidContent);
            this.userBidHistory.put(bidContent.address, currentUserBidHistory);
            this.nasInPool = new BigNumber(value/1000000000000000000).plus(this.nasInPool);  //value的单位wei
        }

        if (this.playerCount === this.firePoint) {
            var seed = Blockchain.transaction.hash.charCodeAt(0);
            var indexBase = this.bidTargets.length;
            var finalTarget = this.bidTargets[seed % indexBase]; // 从"星 冰 乐"中随机出中奖结果
            this.openResult = finalTarget;
            var winners = this._getWinners(finalTarget);  //获取中奖人地址和对应中奖比例

            var commission = new BigNumber(this.commissionRate).times(this.nasInPool);  //计算本期佣金
            this._transferCommission(commission); //无论是否有人胜出，先给平台提取佣金，一旦发放失败，程序终止
            var result = new Result();
            result.openResult = this.openResult;
            if(!winners) { //如果没有赢家， 那么奖金在扣除佣金后进入下一期
                Event.Trigger("NoOneWin", {
                    Pool: {
                        remainNas: this.nasInPool,
                        lastPeriod: this.currentPeriod,
                        lastResult: finalTarget
                    }
                });
                result.winners = [];
                result.totalRewardAmount = 0;
                result.commission = commission;
                result.remainNas = this.nasInPool;
                this.historyResults.put(this.currentPeriod, result);
                return this._restart();
            }

            var totalRewardAmount = 0;
            //按中奖人投注比例发奖，单个人发奖失败不能影响其他人
            for(var k = 0; k < winners.length; k++) {
                var winner = winners[k];
                totalRewardAmount = new BigNumber(totalRewardAmount).plus(winner.shouldRewardAmount);
                var transferResult = Blockchain.transfer(winner.address,
                    winner.shouldRewardAmount);

                if (!transferResult) {
                    Event.Trigger("FailTransferReward", {
                        Transfer: {
                            from: Blockchain.transaction.to,
                            to: winner.address,
                            value: winner.shouldRewardAmount
                        }
                    });
                    winner.rewardAmount = 0;
                    //throw new Error("奖金转账失败. 中奖人地址:" + winner.address + ", NAS数量:" + totalRewardAmount);
                } else {
                    Event.Trigger("SuccessTransferReward", {
                        Transfer: {
                            from: Blockchain.transaction.to,
                            to: winner.address,
                            value: winner.shouldRewardAmount
                        }
                    });
                    winner.rewardAmount = winner.shouldRewardAmount;
                }
            }
            this.nasInPool = new BigNumber(this.nasInPool).minus(totalRewardAmount);
            result.winners = winners;
            result.totalRewardAmount = totalRewardAmount;
            result.commission = commission;
            result.remainNas = this.nasInPool;

            this.historyResults.put(this.currentPeriod, result);
            this._restart();
        } else  {
            return "投注成功请等待开奖";
        }
    },

    _getWinners: function (target) {
        var winBids = [];  // 中奖的所有投注
        var totalBidAmount = new BigNumber(0); //中奖人总共下注的NAS数量
        var winners = []; //中将人地址和奖金分配比例
        for (var i = 1; i <= this.playerCount; i++) {
            var bidContent = this.pool.get(i);
            if(bidContent.bidTarget === target) {
                winBids.push(bidContent);
                totalBidAmount = totalBidAmount.plus(bidContent.bidAmount);
            }
        }
        for (var j = 0; j < winBids.length; j++) {
            var winBid = winBids[j];
            var computedWinBid = {
                address: winBid.address,
                bidAmount: winBid.bidAmount,
                weight: new BigNumber(winBid.bidAmount).dividedBy(totalBidAmount).toFixed(3)
            };
            //e.g. 所有中奖的人按照投资额度百分比瓜分奖池 80%的额度，剩余18%继续累积，2%作为平台每期抽成
            computedWinBid.shouldRewardAmount = new BigNumber(computedWinBid.weight).times(this.rewardRate)
                .times(this.nasInPool);
            computedWinBid.rewardAmount = 0;
            winners.push(computedWinBid);
        }
        return winners;
    },

    _transferCommission: function(commission) {
        var result = Blockchain.transfer(this.commissionAddress, new BigNumber(commission).times(1000000000000000000)); //手续费转到指定账户
        if (!result) {

            Event.Trigger("FailTransferCommission", {
                Transfer: {
                    from: Blockchain.transaction.to,
                    to: this.commissionAddress,
                    value: commission
                }
            });

            throw new Error("手续费转账失败。目标地址:" + this.commissionAddress + ", NAS数量:" + commission);
        }

        Event.Trigger("SuccessTransferCommission", {
            Transfer: {
                from: Blockchain.transaction.to,
                to: this.commissionAddress,
                value: commission
            }
        });
        this.nasInPool = new BigNumber(this.nasInPool).minus(commission);
    },

    _restart: function () {  //开始新一轮
        if(this.playerCount !== this.firePoint) {
            throw new Error("没有达成当期成立标准，不能开始新一期！");
        }

        //如果存在开奖后，转账失败的情况，不允许开始下一轮。
        var lastWinners = this.historyResults.get(this.currentPeriod);
        if(lastWinners.length > 0) {
            for (var i = 0; i < lastWinners.length; i++) {
                if(lastWinners[i].rewardAmount === 0) {
                    throw new Error("本期存在向中奖者转账失败情况，不能开始新一期。中奖者地址："
                     + lastWinners[i].address + ", 应得未得NAS数量：" + lastWinners[i].shouldRewardAmount);
                }
            }
        }

        for (var j = 1; j <= this.playerCount; j++) {
            this.pool.del(j)
        }
        this.playerCount = 0;
        this.currentPeriod ++;
        this.openResult = '';
    },

    //获取当前期数
    getCurrentPeriod: function() {
        return this.currentPeriod;
    },


    //当前参与人数
    getPlayerCount: function() {
        return this.playerCount;
    },

    //获取当前奖池金额，换算成NAS
    getNasInPool: function() {
        return this.nasInPool;
    },

    //获取当前用户的投注情况
    getCurrentUserBidInfo: function () {
        var bidContents = [];
        var currentUserAddress = Blockchain.transaction.from;
        for (var j = 1; j <= this.playerCount; j++) {
            var bidContent = this.pool.get(j);
            if(bidContent.address === currentUserAddress) {
                bidContents.push(bidContent);
            }
        }
        return bidContents;
    },

    //仅返回最近20条(节省存储空间)，下次客户再添加时，也是先执行这个操作，所以始终最多有21条记录
    getCurrentUserBidHistory: function() {
        var history = this.userBidHistory.get(Blockchain.transaction.from);
        if(history) {
            return history.slice(-20);
        }
        return [];
    },

    getCurrentUserAllBidHistory: function() {
        return this.userBidHistory.get(Blockchain.transaction.from);
    },

    //获取当前期概况所有数据
    getCurrentPeriodOverView: function() {
        return {
            firePoint: this.firePoint,
            minNasToJoin: this.minNasToJoin,
            period: this.currentPeriod,
            playerCount: this.playerCount,
            nasInPool: this.nasInPool
        };
    },

    //获取当期需要达标人数
    getFirePointPlayerCount: function() {
        return this.firePoint;
    },

    //获取最小投注金额
    getMinNasToJoin: function() {
        return this.minNasToJoin;
    },

    //获取历史指定期的中奖结果
    getSpecifiedHistoryResult: function(period) {
        if(period) {
            return this.historyResults.get(period);
        } else {
            throw new Error("未指定中奖期数");
        }
    },

    //出于性能考虑，最多返回最近20期
    getHistoryResultOverview: function () {
        var resultOverview = [];
        var loopEnd = this.currentPeriod - 20 <= 0? 0 : this.currentPeriod - 20;
        for (var i = this.currentPeriod - 1; i > loopEnd; i--) {
            var obj = this.historyResults.get(i);
            if(!obj) {
                continue;   //如果当前只是第一期进行中，那么还没有历史数据，不用继续，直接返回
            }
            var resultItem = {};
            resultItem.period = i;
            resultItem.openResult = obj.openResult;
            resultItem.winnersCount = obj.winners.length;
            resultItem.totalRewardAmount = obj.totalRewardAmount;
            resultOverview.push(resultItem);
        }

        return resultOverview;
    },

    //退款给本期成立后的超募名额。前面业务逻辑上会避免超募，系统在收到exception后用户的转账进不来，故此方法暂时不用调用
    _refund: function (address, amount) {
        var transferAmount  = new BigNumber(amount).times(1000000000000000000);
        Blockchain.transfer(address, transferAmount);
    },

    //重新转账 给那些中奖并转账失败的用户
    retryTransferToWinnerNotGetAward: function() {
        if (Blockchain.transaction.from !== this.adminAddress) {
            throw new Error("你无权进行重新转账操作");
        }

        var lastWinners = this.historyResults.get(this.currentPeriod);
        var needRefundWinners = [];
        if(lastWinners.length > 0) {
            for (var i = 0; i < lastWinners.length; i++) {
                if(lastWinners[i].rewardAmount === 0) {
                    needRefundWinners.push(lastWinners[i]);
                }
            }
        } else {
            throw new Error("没有需要重新转账发奖的人");
        }

        for (var j = 0; j < needRefundWinners.length; j++) {
            var winner = needRefundWinners[j];
            var refundResult = Blockchain.transfer(winner.address, winner.shouldRewardAmount.times(1000000000000000000));
            if (!refundResult) {
                Event.Trigger("FailReTransferToWinner", {
                    Transfer: {
                        from: Blockchain.transaction.to,
                        to: winner.address,
                        value: winner.shouldRewardAmount
                    }
                });
                throw new Error("重新发放奖金失败. 中奖人地址:" + winner.address + ", NAS数量:" + winner.shouldRewardAmount);
            } else {
                Event.Trigger("SuccessReTransferToWinner", {
                    Transfer: {
                        from: Blockchain.transaction.to,
                        to: winner.address,
                        value: winner.shouldRewardAmount
                    }
                });
                for (var k = 0; k < lastWinners.length; k++) { //将退款成功信息写进上次中奖结果中
                    if(lastWinners[k].rewardAmount === 0
                        && lastWinners[k].address === winner.address
                        && lastWinners[k].shouldRewardAmount === winner.shouldRewardAmount) {
                        lastWinners[k].rewardAmount = winner.shouldRewardAmount;
                        this.historyResults.put(this.currentPeriod, lastWinners);
                        break;
                    }
                }
            }

        }

        this._restart();
    },

    //提现
    withdraw: function(value) {
        if (Blockchain.transaction.from != this.adminAddress) {
            throw new Error("你无权进行提现操作");
        }

        var lastWinners = this.historyResults.get(this.currentPeriod);
        var needRefundWinners = [];
        if(lastWinners.length > 0) {
            for (var i = 0; i < lastWinners.length; i++) {
                if(lastWinners[i].rewardAmount === 0) {
                    needRefundWinners.push(lastWinners[i]);
                }
            }
        }

        if (lastWinners && lastWinners > 0 &&  needRefundWinners.length !== 0) {
            throw new Error("奖金还没有发放完成，不能提现"); //若上期还有得奖人没有得到佣金，不允许提现。
        }

        if (this.playerCount > 0) {
            throw new Error("本期还有人在玩，不能提现");
        }

        var result = Blockchain.transfer(this.commissionAddress, parseInt(value) * 1000000000000000000);
        if (!result) {

            Event.Trigger("FailWithdraw", {
                Transfer: {
                    from: Blockchain.transaction.to,
                    to: this.commissionAddress,
                    value: value
                }
            });

            throw new Error("提现失败. 提现地址：" + this.commissionAddress + ", NAS:" + value);
        }

        Event.Trigger("SuccessWithdraw", {
            Transfer: {
                from: Blockchain.transaction.to,
                to: this.commissionAddress,
                value: value
            }
        });

        this.nasInPool = new BigNumber(this.nasInPool).minus(value);
    },

    //调整开奖参数
    config: function(minNasToJoin, firePoint, rewardRate, commissionRate) {
        if (Blockchain.transaction.from !== this.adminAddress) {
            throw new Error("你无权进行配置操作");
        }

        if (minNasToJoin < 0.1) {
            throw new Error("最小参与的押注金额不能低于 0.1 NAS");
        }

        if(firePoint < 5) {
            throw new Error("每期参与人数不能低于5人");
        }

        if(rewardRate < 0.5 && rewardRate > 0.95) {
            throw new Error("返奖比例不能低于50%，不能高于95%");
        }

        if(commissionRate < 0 && rewardRate > 0.2 && commissionRate + rewardRate > 1) {
            throw new Error("平台佣金比例不能为负数，也不能超过20%，和返奖比例之和不能超过100%");
        }

        this.minNasToJoin = parseFloat(minNasToJoin);
        this.firePoint = parseInt(firePoint);
        this.rewardRate = parseFloat(rewardRate);
        this.commissionRate = parseFloat(commissionRate);
    },

    //调整手续费收款地址。
    setCommissionAddress: function(newAddress) {
        if (Blockchain.transaction.from !== this.adminAddress) {
            throw new Error("你无权进行重置手续费收费地址操作");
        }

        this.commissionAddress = newAddress;
    }
};


module.exports = xblContract;
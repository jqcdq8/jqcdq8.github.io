/**
 * Created by chenjihu on 2018/5/20.
 */
Vue.component('bid-target', {
    props: ['target'],
    template: '<div><input type="radio" name="bid-target-option" ' +
    ':value="target.text"/> <label>{{target.text}}</label></div>'
});

var rule_panel = new Vue( {
    el: '#rule-panel',
    data: {
        firePoint: 5,
        minNasToJoin: 0.2
    }
});

var current_period_overview_panel = new Vue({
    el: '#current-period-overview-panel',
    data: {
        period: 1,
        count: 0,
        nasInThePool: 0
    }
});

var history_result_panel = new Vue({
    el: '#history-result-panel',
    data: {
        results: []
    }
});

var history_bid_panel = new  Vue({
    el: '#history-bid-panel',
    data: {
        results: []
    }
});

var bidPanel = new Vue({
    el: '#bid-panel',
    data: {
        target: '',
        nas_input: 0.5,
        btn_text: '确认提交',
        send_result: ''
    },
    methods: {
        send: function () {
            this.send_result = '正在提交';
            setTimeout(function () {
                bidPanel.send_result = '';
            }, 3000);
            bid(); //index.html中定义的发送交易的方法
        }
    },
    computed: {
        message: function () {
            return '你将投注' + this.nas_Num + '个NAS，押注本期开"'
                + this.target + '"字';
        },
        nas_Num: {
            get: function () {
                return this.nas_input.toString().replace(/[^\d.]+/g, '')
                    .replace(/^0+(\d)/g, '$1');
            },
            set: function (newVal) {
                this.nas_input = newVal;
            }
        }
    }
});




// Neb block
var NebPay = require("nebpay");
var nebPay = new NebPay();
var contractAddress = "n1yz9WUM1b9AVgAL3MtmcHfJmotkZuJgkAv";
var serialNumber;
var intervalQuery;

var nebulas = require("nebulas"),
    Account = nebulas.Account,
    neb = new nebulas.Neb();
neb.setRequest(new nebulas.HttpRequest("https://mainnet.nebulas.io"));

var from = 'n1a9vVHjSc1hwfebqHcHsf4MhMpm6SVCCc7';
var value = "0";
var nonce = "1";
var gas_price = "1000000";
var gas_limit = "2000000";

if (typeof (webExtensionWallet) === "undefined") {
    alert("请先安装星云钱包插件.");
}

function fill_current_period_overview() {
    var callFunction = "getCurrentPeriodOverView";
    var callArgs = "[]";
    var contract = {
        "function": callFunction,
        "args": callArgs
    };
    neb.api.call(from, contractAddress, value, nonce
        , gas_price, gas_limit, contract).then(function (res) {
        var jsonData = JSON.parse(res.result);
        current_period_overview_panel.period = jsonData.period;
        current_period_overview_panel.count = jsonData.playerCount;
        current_period_overview_panel.nasInThePool = jsonData.nasInPool;
        rule_panel.firePoint = jsonData.firePoint;
        rule_panel.minNasToJoin = jsonData.minNasToJoin;
        bidPanel.nas_input = jsonData.minNasToJoin;
    }).catch(function (err) {
        //cbSearch(err)
        console.log('发生异常：' + err.toString());
    });
}

fill_current_period_overview();
fill_history_result_panel();
fill_history_bid_panel();
setInterval(function () {
    fill_current_period_overview();
    fill_history_result_panel();
    fill_history_bid_panel();
}, 20000);

//用户下注，这步必须要求用户使用钱包
function bid() {
    serialNumber = nebPay.call(contractAddress,
        bidPanel.nas_Num,
        'bid',
        "[\"" + bidPanel.target + "\"]",
        {
            qrcode: {
                showQRCode: false
            },
            goods: {
                name: "Bid",
                desc: "Nas for bid"
            },
            listener: bidSent
        });

    /**
     intervalQuery = setInterval(function () {
            queryBidPayInfo();
        }, 5000);
     **/
}

function bidSent(resp) {
    // do nothing
}

function fill_history_bid_panel() {
    var callFunction = "getCurrentUserBidHistory";
    var callArgs = "[]";
    var contract = {
        "function": callFunction,
        "args": callArgs
    };
    neb.api.call(from, contractAddress, value, nonce
        , gas_price, gas_limit, contract).then(function (res) {
        var jsonData = JSON.parse(res.result);
        history_bid_panel.results = jsonData;
    }).catch(function (err) {
        console.log('发生异常：' + err.toString());
    });
}

function fill_history_result_panel() {
    var callFunction = "getHistoryResultOverview";
    var callArgs = "[]";
    var contract = {
        "function": callFunction,
        "args": callArgs
    };
    neb.api.call(from, contractAddress, value, nonce
        , gas_price, gas_limit, contract).then(function (res) {
        var jsonData = JSON.parse(res.result);
        history_result_panel.results = jsonData;
    }).catch(function (err) {
        //cbSearch(err)
        console.log('发生异常：' + err.toString());
    });
}
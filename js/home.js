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
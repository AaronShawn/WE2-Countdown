/*
 * WE2 Countdown  ·  流浪地球2 倒计时 · After Effects 生成面板
 * ---------------------------------------------------------------
 * 安装：把本文件放进  After Effects/Scripts/ScriptUI Panels/  ，重启 AE，
 *       菜单 窗口(Window) → WE2_Countdown.jsx
 * 也可直接 文件 → 脚本 → 运行脚本文件 以浮动窗口方式使用。
 *
 * 版式数据取自 lab.wsm.ink/the-wandering-earth-2-countdown 的源码：
 *   红条 4×68；起始文字 36px 字魂59号；数字 84px Alte DIN；小字 18px 大写 DIN；
 *   起始文字字距 -100；数字距起始文字 4px；结束文字紧贴数字；
 *   顶部文字右对齐于“起始文字”右端 +2px；底部小字缩进 10px，行距 ≈17.3px。
 *
 * 本版相对原始版本的修复（2025-xx 真机 AE 25.0x53 验证）：
 *   1. Style 下拉菜单控件在 AE 里是伪效果，改名不生效且句柄失效 → 改用滑块（1…3），
 *      面板里仍是下拉框，读写的是滑块值。
 *   2. 排版抖动：带 Text Animator 的文字层 sourceRectAtTime 会把飞出去的字符算进包围盒，
 *      入场时整条排版链左右乱窜最多 185px → 新增隐藏的“测量孪生层”（名字后缀 " ·M"），
 *      只量孪生层；孪生层复制主层的文字与字距。
 *   3. 面板“最少位数”滑块不参与创建，一重建就被重置为 0 → build 改为读 cfg.minDigits。
 *   4. 改动字距后孪生层没同步（sourceText 表达式只跟随文字，不跟随 tracking/字体/字号）
 *      → 写主层的同时把 tracking 写到孪生层。
 *   5. AE 不允许直接替换“已有字体”的文字层字体（静默无效），原来还误报成字距失败
 *      → 写前取 beforeFont，只有真的换了且没换成功才报失败，并在面板弹窗里说明“请重建”。
 *   6. keyIntro 先打入场再打出场时，出场的第一帧会覆盖入场关键帧，入场被整段吃掉
 *      → 出场起点若落在已有键之前，自动顺延到最后一个键之后。
 *   7. “秒”会压住数字右缘（DIN 的墨迹比字宽宽约 3.5px）→ End Gap 默认改为 4px，
 *      面板“结尾间距”仍可调回 0。
 *   8. 新增「整体缩放 %」滑块（网页是 1:1 像素，1080p 下偏小）。
 *   9. 新增「自动倒数」：倒数时长 > 0 时，数字从当前值随时间递减到 0；
 *      「入场时长」也从输入框改成了滑块，打关键帧直接读它。
 *  10. 新增「单位」滑块（1年 2个月 3周 4天 5小时 6分钟 7秒）：
 *      结束文字留空即自动用单位名；改单位时面板会把结束文字一起改过来。
 *  11. 底部小字改成模板层驱动：写 {n} = 当前数字、{u} = 单位，会跟着数字实时变
 *      （例：less than {n} {u}）。模板存在隐藏的「WE Sub Tpl」层上。
 */
(function (thisObj) {

    // ------------------------------------------------------------------ 常量
    var SCRIPT_NAME = "WE2 Countdown 流浪地球2倒计时";
    var CTRL = "WE Controller";
    var NAMES = { bar: "WE Bar", top: "WE Top", start: "WE Start", num: "WE Number", end: "WE End", sub: "WE Sub" };
    var SUL = " ·M";   // 隐藏“测量孪生层”的后缀
    var FONT_MAIN = "zihun59hao-chuangcuhei";                 // 字魂59号-创粗黑 (PostScript 名)
    var FONT_NUM  = "AlteDIN1451Mittelschriftgepraegt";       // Alte DIN 1451 Mittelschrift gepraegt
    // 单位表：Unit 滑块 1…7 对应这里。结束文字留空时自动用它。
    var UNAMES = ["年", "个月", "周", "天", "小时", "分钟", "秒"];
    var TPL_LAYER = "WE Sub Tpl";   // 底部小字的“模板层”（隐藏），支持 {n} 当前数字、{u} 单位

    // 网页(fabric.js)中的布局，单位 px，坐标以整组左上角为原点
    var LY = {
        barX: 0, barTop: 43, barW: 4, barH: 68,
        startX: 8,            // 红条右缘 4 + 间距 4
        subX: 10,             // 红条右缘 4 + 6
        yMain: 65.6,          // 36px 文字基线  (34 + 0.879*36)
        yNum: 69.8,           // 84px 数字基线  (-4 + 0.879*84)
        yTop: 31.6,           // 顶部文字基线
        ySub: 91.8,           // 小字首行基线   (76 + 0.879*18)
        subLead: 17.3,        // 18*1.13*0.85
        fsMain: 36, fsNum: 84, fsSub: 18,
        topInset: 2
    };

    // ------------------------------------------------------------------ 表达式
    // 公共前缀：读取控制器的参数
    var PRE =
        'var C=thisComp.layer("' + CTRL + '");\n' +
        'function cl(x){return Math.max(0,Math.min(1,x));}\n' +
        'function eo(t,k){return 1-Math.pow(1-t,k);}\n' +
        'function eio(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}\n' +
        'var P=cl(C.effect("Progress")(1)/100);\n' +
        'var S=Math.max(1,Math.min(3,Math.round(C.effect("Style")(1))));\n' +
        'var SD=C.effect("Seed")(1);\n' +
        'function win(a,b){return cl((P-a)/(b-a));}\n';

    // 逐字符选择器的前缀。a,b = 该部件在总进度中的起止 (0~1)
    function CHAR(a, b) {
        return PRE +
            'var t=win(' + a + ',' + b + ');\n' +
            'var N=Math.max(textTotal,1);var i=textIndex;\n' +
            'seedRandom(i*7+SD*131,true);var R1=random(),R2=random(),R3=random();\n' +
            // 出场顺序：1=随机  2=从左到右  3=从中间向两侧
            'var rk=(S==1)?R1:(S==2?(N>1?(i-1)/(N-1):0):(N>1?Math.abs(i-(N+1)/2)/((N-1)/2):0));\n' +
            'var sp=C.effect("Stagger")(1)/100*0.65,du=1-sp;\n' +
            'var tc=cl((t-rk*sp)/du);\n' +
            'var e=eo(tc,S==3?4:5);var th=R2*Math.PI*2;\n';
    }
    var AMT = {
        base:  '100',
        posX:  'S==1?Math.cos(th)*(1-e)*100:0',
        posY:  'S==1?Math.sin(th)*(1-e)*100:(S==2?(1-e)*100:0)',
        blur:  '(1-eo(tc,3))*100',
        opac:  '(1-eo(cl(tc*2.4),2))*100',
        scale: 'S==2?0:(1-e)*100',
        rot:   'S==1?(R3-0.5)*2*(1-e)*100:0',
        skew:  'S==2?(1-e)*100:0',
        track: '(1-e)*100'
    };

    // 各部件的时间窗（占总进度的比例）。小字与数字使用同一窗口 => 同步变换
    var WIN = {
        top: [0.12, 0.62], start: [0.16, 0.66], num: [0.26, 0.86], end: [0.38, 0.90], sub: [0.26, 0.86]
    };

    // 量宽度只量孪生层：主层带着逐字动画器，sourceRectAtTime 会把飞出去的字符算进去，
    // 直接用主层测宽会让整条排版链在入场过程中左右乱跑（实测最多漂 185px）。
    function rectOf(n) { return 'thisComp.layer("' + n + SUL + '").sourceRectAtTime(time,false)'; }

    // 自动排版（进退格）：全部由文字实际宽度推出，改字即自动重排
    function posExpr(which) {
        var h = 'var C=thisComp.layer("' + CTRL + '");\n';
        if (which === "start")
            return h + 'var a=' + rectOf(NAMES.start) + ';\n[' + LY.startX + '-a.left,' + LY.yMain + ']';
        if (which === "num")
            return h + 'var a=' + rectOf(NAMES.start) + ',b=' + rectOf(NAMES.num) + ';\n' +
                'var x0=' + LY.startX + '+a.width+C.effect("Number Gap")(1);\n[x0-b.left,' + LY.yNum + ']';
        if (which === "end")
            return h + 'var a=' + rectOf(NAMES.start) + ',b=' + rectOf(NAMES.num) + ',c=' + rectOf(NAMES.end) + ';\n' +
                'var x0=' + LY.startX + '+a.width+C.effect("Number Gap")(1)+b.width+C.effect("End Gap")(1);\n[x0-c.left,' + LY.yMain + ']';
        if (which === "top")
            return h + 'var a=' + rectOf(NAMES.start) + ',t=' + rectOf(NAMES.top) + ';\n' +
                '[' + LY.startX + '+a.width+' + LY.topInset + '-(t.left+t.width),' + LY.yTop + ']';
        if (which === "sub")
            return h + 'var s=' + rectOf(NAMES.sub) + ';\n[' + LY.subX + '-s.left,' + LY.ySub + ']';
    }
    // 数字的取值内核：静态 / 倒数 + 补零，最后得到字符串变量 NUM
    var NUM_CORE =
        'var C=thisComp.layer("' + CTRL + '");var n=C.effect("Number")(1);' +
        'var sec=C.effect("Count Sec")(1);' +
        'if(sec>0.001){var t0=C.effect("Count Start")(1);var k=(time-t0)/sec;if(k<0)k=0;if(k>1)k=1;n=n*(1-k);}' +
        'var v=Math.round(n);var m=Math.round(C.effect("Min Digits")(1));var s=String(Math.abs(v));' +
        'while(s.length<m)s="0"+s;var NUM=(v<0?"-":"")+s;';
    var NUM_SRC = NUM_CORE + 'NUM';
    // 单位名（表达式里取，跟着 Unit 滑块走）
    var UNIT_CORE = 'var UI=Math.round(C.effect("Unit")(1));if(UI<1)UI=1;if(UI>7)UI=7;' +
        'var U=[' + (function () { var a = []; for (var i = 0; i < UNAMES.length; i++) a.push('"' + UNAMES[i] + '"'); return a.join(","); })() + '];' +
        'var UNIT=U[UI-1];';
    // 底部小字：把模板里的 {n} 换成数字、{u} 换成单位（不用正则，纯 indexOf 循环，表达式引擎更稳）
    var SUB_SRC = NUM_CORE + UNIT_CORE +
        'var tpl=String(thisComp.layer("' + TPL_LAYER + '").text.sourceText);' +
        'var i=tpl.indexOf("{n}");' +
        'while(i>=0){tpl=tpl.substring(0,i)+NUM+tpl.substring(i+3);i=tpl.indexOf("{n}");}' +
        'i=tpl.indexOf("{u}");' +
        'while(i>=0){tpl=tpl.substring(0,i)+UNIT+tpl.substring(i+3);i=tpl.indexOf("{u}");}' +
        'tpl';

    // 红条
    var BAR = {
        anchorY: PRE + 'var y=(S==2)?' + LY.barTop + ':(S==3?' + (LY.barTop + LY.barH) + ':' + (LY.barTop + LY.barH / 2) + ');\n[' + (LY.barW / 2) + ',y]',
        scale:   PRE + 'var t=win(0,0.40);var sy,sx=100;\n' +
                 'if(S==1){sy=eo(t,4)*100;sx=100+120*Math.pow(Math.sin(Math.PI*t),2);}\n' +   // 中心向两端拉长并微微“胀”一下
                 'else if(S==2){sy=eio(t)*100;}\n' +                                             // 自上而下划出
                 'else{sy=eo(t,5)*100;sx=100+60*Math.pow(Math.sin(Math.PI*t),2);}\n' +           // 自下而上冲出
                 '[sx,sy]',
        opac:    PRE + 'win(0,0.40)>0?100:0',
        fill:    'thisComp.layer("' + CTRL + '").effect("Highlight Color")(1)'
    };

    // ------------------------------------------------------------------ 工具函数
    function getComp() { var c = app.project.activeItem; return (c instanceof CompItem) ? c : null; }
    function findLayer(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i);
        return null;
    }
    function fxProp(ctrl, name) { var e = ctrl.property("ADBE Effect Parade").property(name); return e ? e.property(1) : null; }
    function setCtl(name, v) {
        var comp = getComp(); if (!comp) return;
        var c = findLayer(comp, CTRL); if (!c) return;
        var p = fxProp(c, name); if (!p) return;
        if (p.numKeys > 0) p.setValueAtTime(comp.time, v); else p.setValue(v);
    }
    function getCtl(name, dflt) {
        var comp = getComp(); if (!comp) return dflt;
        var c = findLayer(comp, CTRL); if (!c) return dflt;
        var p = fxProp(c, name); return p ? p.value : dflt;
    }
    function addFx(ctrl, matchName, name, value) {
        var fx = ctrl.property("ADBE Effect Parade").addProperty(matchName);
        fx.name = name;
        if (value !== undefined) fx.property(1).setValue(value);
        return fx;
    }
    function setExpr(prop, str) { prop.expression = str; }
    function toColor(i) { return [((i >> 16) & 255) / 255, ((i >> 8) & 255) / 255, (i & 255) / 255, 1]; }
    function fromColor(c) { return (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255); }
    // $.colorPicker 取消时返回 -1。
    // 注意 0xFFFFFF（纯白）在 ExtendScript 里是 16777215，是正数，不会和 -1 撞；
    // 但不同 AE 版本返回值可能是带符号的 32 位，统一用 -1 判断即可。
    function pickColor(cur) {
        var r = $.colorPicker(fromColor(cur));
        if (r === undefined || r === null || r === -1) return null;
        return toColor(r);
    }

    // ------------------------------------------------------------------ 文字层
    function styleText(layer, o) {
        var tp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value;
        td.resetCharStyle();
        td.font = o.font; td.fontSize = o.size;
        td.applyFill = true; td.fillColor = o.color || [1, 1, 1]; td.applyStroke = false;
        td.tracking = o.tracking || 0;
        td.justification = ParagraphJustification.LEFT_JUSTIFY;
        try { td.allCaps = !!o.caps; } catch (e) {}
        if (o.leading) { try { td.autoLeading = false; td.leading = o.leading; } catch (e2) {} }
        if (o.text !== undefined) td.text = o.text;
        tp.setValue(td);
        // AE 偶尔会静默吞掉字体（probe9 的坑），重试几次直到读回正确
        for (var ftry = 0; ftry < 3 && o.font && tp.value.font !== o.font; ftry++) {
            var td2 = tp.value; td2.font = o.font; td2.fontSize = o.size; tp.setValue(td2);
        }
        layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
    }
    function addAnimator(layer, name, props, amountExpr, sel) {
        var anims = layer.property("ADBE Text Properties").property("ADBE Text Animators");
        var an = anims.addProperty("ADBE Text Animator");
        an.name = name;
        var pg = an.property("ADBE Text Animator Properties");
        for (var i = 0; i < props.length; i++) {
            var pr = pg.addProperty(props[i].match);
            if (props[i].value !== undefined) { try { pr.setValue(props[i].value); } catch (e) {} }
            if (props[i].expr) pr.expression = props[i].expr;
        }
        var sels = an.property("ADBE Text Selectors");
        try { sels.property(1).remove(); } catch (e2) {}
        var es = sels.addProperty("ADBE Text Expressible Selector");
        es.property("ADBE Text Expressible Amount").expression = sel + 'var __a=' + amountExpr + ';\n__a';
        return an;
    }
    // 为一个文字层装配“基础”(锚点居中+颜色) 与 8 个动效动画器
    function rigText(layer, o) {
        var w = WIN[o.part], sel = CHAR(w[0], w[1]);
        var kp = o.kPos, kb = o.kBlur, ks = o.kScale;
        var C = 'var C=thisComp.layer("' + CTRL + '");\n';
        // 0 基础：锚点移到字符中心，同时位置反向补偿 => 缩放以字符中心为轴；并绑定颜色
        addAnimator(layer, "Base", [
            { match: "ADBE Text Anchor Point 3D", expr: '[0,-' + o.cy + ',0]' },
            { match: "ADBE Text Position 3D", expr: '[0,-' + o.cy + ',0]' },
            { match: "ADBE Text Fill Color", expr: C + 'C.effect("' + o.colorCtl + '")(1)' }
        ], AMT.base, '');
        addAnimator(layer, "Fly X", [{ match: "ADBE Text Position 3D", expr: PRE + '[C.effect("Travel")(1)*' + kp + ',0,0]' }], AMT.posX, sel);
        addAnimator(layer, "Fly Y", [{ match: "ADBE Text Position 3D", expr: PRE + '[0,C.effect("Travel")(1)*' + kp + '*(S==2?0.32:1),0]' }], AMT.posY, sel);
        addAnimator(layer, "Blur", [{ match: "ADBE Text Blur", expr: C + 'var b=C.effect("Blur")(1)*' + kb + ';[b,b]' }], AMT.blur, sel);
        addAnimator(layer, "Opacity", [{ match: "ADBE Text Opacity", value: 0 }], AMT.opac, sel);
        addAnimator(layer, "Scale", [{ match: "ADBE Text Scale 3D", expr: PRE + 'var s=(S==1)?' + (135 * ks) + ':(S==3?' + (240 * ks) + ':100);[s,s,100]' }], AMT.scale, sel);
        addAnimator(layer, "Rotate", [{ match: "ADBE Text Rotation", value: 22 }], AMT.rot, sel);
        try { addAnimator(layer, "Skew", [{ match: "ADBE Text Skew", value: 30 }], AMT.skew, sel); } catch (e) {}
        if (o.tracking) addAnimator(layer, "Tracking", [{ match: "ADBE Text Tracking Amount", expr: PRE + '(S==3)?180:((S==2)?50:0)' }], AMT.track, sel);
        // 投影，复刻网页 rgba(0,0,0,.5) 0 0 15px
        try {
            var ds = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
            ds.property("ADBE Drop Shadow-0002").setValue(128);
            ds.property("ADBE Drop Shadow-0004").setValue(0);
            ds.property("ADBE Drop Shadow-0005").setValue(15);
        } catch (e3) {}
    }

    // ------------------------------------------------------------------ 构建
    function build(cfg) {
        var comp = getComp();
        if (!comp) { alert("请先在时间线面板里选中一个合成(或新建合成)。"); return; }
        app.beginUndoGroup("Build WE2 Countdown");
        try {
            // 清除旧版（含测量孪生层）
            var kill = {};
            kill[CTRL] = 1; kill[TPL_LAYER] = 1;
            for (var kk in NAMES) { kill[NAMES[kk]] = 1; kill[NAMES[kk] + SUL] = 1; }
            for (var i = comp.numLayers; i >= 1; i--) {
                if (kill[comp.layer(i).name]) comp.layer(i).remove();
            }
            // 控制器
            var ctrl = comp.layers.addNull(comp.duration);
            ctrl.name = CTRL; ctrl.label = 1;
            ctrl.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width * 0.5 - 330, comp.height * 0.5 - 62]);
            addFx(ctrl, "ADBE Slider Control", "Progress", 100);
            // 样式用滑块：AE 2025 的「下拉菜单控件」是伪效果(pseudo effect)，改名不生效
            // 且其属性句柄会失效，表达式无法按名字 C.effect("Style") 取到 —— 只能用滑块。
            addFx(ctrl, "ADBE Slider Control", "Style", cfg.style);
            addFx(ctrl, "ADBE Slider Control", "Number", cfg.number);
            addFx(ctrl, "ADBE Slider Control", "Min Digits", (cfg.minDigits === undefined || cfg.minDigits === null) ? 0 : cfg.minDigits);
            // 自动倒数：Count Sec > 0 时，数字从 Number 递减到 0（按 Count Start 秒开始）
            addFx(ctrl, "ADBE Slider Control", "Count Sec", 0);
            addFx(ctrl, "ADBE Slider Control", "Count Start", 0);
            // 单位：1年 2个月 3周 4天 5小时 6分钟 7秒
            var unitIdx = (cfg.unit === undefined || cfg.unit === null) ? 7 : Math.max(1, Math.min(7, Math.round(cfg.unit)));
            addFx(ctrl, "ADBE Slider Control", "Unit", unitIdx);
            // 打入场/出场关键帧用的时长
            addFx(ctrl, "ADBE Slider Control", "Intro Sec", 1.6);
            addFx(ctrl, "ADBE Slider Control", "Stagger", 55);
            addFx(ctrl, "ADBE Slider Control", "Blur", 60);
            addFx(ctrl, "ADBE Slider Control", "Travel", 260);
            addFx(ctrl, "ADBE Slider Control", "Seed", 7);
            addFx(ctrl, "ADBE Slider Control", "Number Gap", 4);
            addFx(ctrl, "ADBE Slider Control", "End Gap", 4);
            addFx(ctrl, "ADBE Color Control", "Text Color", [1, 1, 1, 1]);
            addFx(ctrl, "ADBE Color Control", "Highlight Color", [1, 0, 0, 1]);
            // 整体缩放：网页是按 1:1 像素排的，直接放进 1080p 合成会偏小，给个统一倍率
            addFx(ctrl, "ADBE Slider Control", "Group Scale", 100);
            setExpr(ctrl.property("ADBE Transform Group").property("ADBE Scale"),
                'var g=thisComp.layer("' + CTRL + '").effect("Group Scale")(1)/100;\n[g*100,g*100]');

            // 红条
            var bar = comp.layers.addShape(); bar.name = NAMES.bar;
            var grp = bar.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            var rc = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            rc.property("ADBE Vector Rect Size").setValue([LY.barW, LY.barH]);
            rc.property("ADBE Vector Rect Position").setValue([LY.barW / 2, LY.barTop + LY.barH / 2]);
            var fl = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            setExpr(fl.property("ADBE Vector Fill Color"), BAR.fill);
            var bt = bar.property("ADBE Transform Group");
            setExpr(bt.property("ADBE Anchor Point"), BAR.anchorY);
            setExpr(bt.property("ADBE Position"), BAR.anchorY);
            setExpr(bt.property("ADBE Scale"), BAR.scale);
            setExpr(bt.property("ADBE Opacity"), BAR.opac);

            // 文字层
            function mk(key, text, font, size, opt) {
                var L = comp.layers.addText(text); L.name = NAMES[key];
                styleText(L, { font: font, size: size, text: text, tracking: opt.tracking, caps: opt.caps, leading: opt.leading });
                setExpr(L.property("ADBE Transform Group").property("ADBE Position"), posExpr(key));
                rigText(L, opt.rig);
                return L;
            }
            var tr = cfg.mainSpacing;
            var tTop   = mk("top",   cfg.top,   cfg.fontMain, LY.fsMain, { tracking: tr, rig: { part: "top",   cy: 12.6, kPos: 0.8, kBlur: 0.6, kScale: 0.7, colorCtl: "Text Color" } });
            var tStart = mk("start", cfg.start, cfg.fontMain, LY.fsMain, { tracking: tr, rig: { part: "start", cy: 12.6, kPos: 0.8, kBlur: 0.6, kScale: 0.7, colorCtl: "Text Color" } });
            var tNum   = mk("num",   String(cfg.number), cfg.fontNum, LY.fsNum, { tracking: 0, rig: { part: "num", cy: 30, kPos: 1, kBlur: 1, kScale: 1, colorCtl: "Highlight Color" } });
            var endText = (cfg.end === undefined || cfg.end === null || cfg.end === "") ? UNAMES[unitIdx - 1] : cfg.end;
            var tEnd   = mk("end",   endText, cfg.fontMain, LY.fsMain, { tracking: tr, rig: { part: "end",   cy: 12.6, kPos: 0.8, kBlur: 0.6, kScale: 0.7, colorCtl: "Text Color" } });
            var tSub   = mk("sub",   cfg.sub.replace(/\n/g, "\r"), cfg.fontNum, LY.fsSub, { tracking: cfg.subSpacing, caps: true, leading: LY.subLead,
                              rig: { part: "sub", cy: 6.3, kPos: 0.55, kBlur: 0.5, kScale: 0.6, colorCtl: "Text Color", tracking: true } });
            setExpr(tNum.property("ADBE Text Properties").property("ADBE Text Document"), NUM_SRC);

            // ---- 底部小字的模板层：保存原始模板（含 {n}{u}），小字层本身用表达式去替换它
            var tpl = comp.layers.addText(cfg.sub.replace(/\n/g, "\r"));
            tpl.name = TPL_LAYER;
            styleText(tpl, { font: cfg.fontNum, size: LY.fsSub, text: cfg.sub.replace(/\n/g, "\r"), tracking: cfg.subSpacing, caps: true, leading: LY.subLead });
            tpl.property("ADBE Transform Group").property("ADBE Position").setValue([-3600, -4600]);
            tpl.property("ADBE Transform Group").property("ADBE Opacity").setValue(0);
            try { tpl.guideLayer = true; } catch (e5) {}
            try { tpl.shy = true; } catch (e6) {}
            setExpr(tSub.property("ADBE Text Properties").property("ADBE Text Document"), SUB_SRC);

            // ---- 测量孪生层：与主层同字体同字距、文字跟随主层（含数字层表达式）、不渲染、挪到画外
            var twins = [];
            function twin(mainL, key, font, size, opt, initText) {
                var M = comp.layers.addText(initText);
                M.name = NAMES[key] + SUL;
                styleText(M, { font: font, size: size, text: initText, tracking: opt.tracking, caps: opt.caps, leading: opt.leading });
                setExpr(M.property("ADBE Text Properties").property("ADBE Text Document"),
                        'thisComp.layer("' + NAMES[key] + '").text.sourceText');
                var Mt = M.property("ADBE Transform Group");
                Mt.property("ADBE Position").setValue([-3600, -3600 - twins.length * 260]);
                Mt.property("ADBE Opacity").setValue(0);
                try { M.guideLayer = true; } catch (e1) {}
                try { M.shy = true; } catch (e2) {}
                twins.push(M);
                return M;
            }
            twin(tTop,   "top",   cfg.fontMain, LY.fsMain, { tracking: tr },                 cfg.top);
            twin(tStart, "start", cfg.fontMain, LY.fsMain, { tracking: tr },                 cfg.start);
            twin(tNum,   "num",   cfg.fontNum,  LY.fsNum,  { tracking: 0 },                  String(cfg.number));
            twin(tEnd,   "end",   cfg.fontMain, LY.fsMain, { tracking: tr },                 endText);
            twin(tSub,   "sub",   cfg.fontNum,  LY.fsSub,  { tracking: cfg.subSpacing, caps: true, leading: LY.subLead }, cfg.sub.replace(/\n/g, "\r"));

            // 全部挂到控制器下：整体移动/缩放只需动控制器
            var all = [bar, tTop, tStart, tNum, tEnd, tSub];
            for (var k = 0; k < all.length; k++) all[k].parent = ctrl;
            ctrl.moveToBeginning();

            // 验证字体（AE 偶发静默吞字体，styleText 里已重试；这里只报真的没写进去的）
            var bad = [];
            try {
                var fTop = tStart.property("ADBE Text Properties").property("ADBE Text Document").value.font;
                if (fTop !== cfg.fontMain) bad.push("主字体 " + cfg.fontMain + "（实际 " + fTop + "）");
                var fSub = tpl.property("ADBE Text Properties").property("ADBE Text Document").value.font;
                if (fSub !== cfg.fontNum) bad.push("数字字体 " + cfg.fontNum + "（实际 " + fSub + "）");
            } catch (e4) {}
            if (bad.length) alert("以下字体未被识别，请先安装 fonts 文件夹中的两个字体后点【应用字距 / 字体】：\n" + bad.join("\n"));
            ctrl.selected = true;
        } catch (err) {
            alert("构建失败: " + err.toString() + "  (line " + err.line + ")");
        }
        app.endUndoGroup();
    }
    function setText(key, str) {
        var comp = getComp(); if (!comp) return;
        var L = findLayer(comp, (key === "sub") ? TPL_LAYER : NAMES[key]); if (!L) return;
        var tp = L.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value; td.text = (key === "sub") ? str.replace(/\n/g, "\r") : str; tp.setValue(td);
    }
    function readText(key) {
        var comp = getComp(); if (!comp) return null;
        var L = findLayer(comp, (key === "sub") ? TPL_LAYER : NAMES[key]); if (!L) return null;
        return L.property("ADBE Text Properties").property("ADBE Text Document").value.text.replace(/\r/g, "\n");
    }
    // 字距 + 字体一起写。
    // 1) tracking 能改，且必须同时写主层和它的测量孪生层 —— 孪生层的 sourceText 表达式只跟随「文字」，
    //    不跟随 tracking / font / fontSize，不写就会拿旧宽度去排版。
    // 2) AE 里 TextDocument.font 作用在已经有字体的文字层上会静默失败（不抛错、读回还是旧字体），
    //    只有新建文字层时设置才有效 —— 所以换字体只能走【创建 / 重建】，这里把失败项报回去。
    function applyTextStyle(mainSp, subSp, fontMain, fontNum) {
        var out = { failed: [], done: 0 };
        var comp = getComp(); if (!comp) return out;
        var map = [
            ["top", fontMain, mainSp], ["start", fontMain, mainSp], ["end", fontMain, mainSp],
            ["sub", fontNum, subSp], ["num", fontNum, 0]
        ];
        app.beginUndoGroup("WE2 text style");
        for (var i = 0; i < map.length; i++) {
            var key = map[i][0], font = map[i][1], trk = map[i][2];
            var names = [NAMES[key], NAMES[key] + SUL];
            for (var n = 0; n < names.length; n++) {
                var L = findLayer(comp, names[n]); if (!L) continue;
                var tp = null;
                try { tp = L.property("ADBE Text Properties").property("ADBE Text Document"); } catch (e0) { continue; }
                var beforeFont = null;
                if (n === 0 && font) { try { beforeFont = tp.value.font; } catch (e3) { } }
                // 小字层的文本由表达式驱动，写 TextDocument 前必须先摘掉表达式（写完再挂回去）
                var hadExpr = false;
                try { if (tp.expression !== "" && tp.expressionEnabled) { tp.expressionEnabled = false; hadExpr = true; } } catch (e4) { }
                try {
                    var td = tp.value;
                    td.tracking = trk;
                    if (n === 0 && font) td.font = font;   // 字体只需写主层；孪生层建的时候就同字体
                    tp.setValue(td);
                    out.done++;
                } catch (e1) { }
                if (hadExpr) { try { tp.expressionEnabled = true; } catch (e5) { } }
                // 只有「本来就不是这个字体」才算失败；已经是目标字体时不要误报
                if (n === 0 && font && beforeFont !== font) {
                    var got = null;
                    try { got = tp.value.font; } catch (e2) { }
                    if (got !== font) out.failed.push(NAMES[key] + "  →  " + font);
                }
            }
        }
        app.endUndoGroup();
        return out;
    }
    // 拖动字距滑块时用：只改字距，不碰字体
    function applyTracking(mainSp, subSp) { return applyTextStyle(mainSp, subSp, null, null); }
    function applyStyle(cfg) { return applyTextStyle(cfg.mainSpacing, cfg.subSpacing, cfg.fontMain, cfg.fontNum); }
    // 在当前时间插入入场 / 出场关键帧
    function keyIntro(sec, reverse) {
        var comp = getComp(); if (!comp) return;
        var c = findLayer(comp, CTRL); if (!c) { alert("请先点【创建 / 重建】。"); return; }
        var p = fxProp(c, "Progress"); var t0 = comp.time;
        // 入场是 [t0, t0+sec] 从 0 升到 100，出场是 [t0, t0+sec] 从 100 降到 0。
        // 两种键都不能和既有键撞在同一时刻（同刻会互相覆盖，后打的赢）；
        // 也不能落在既有动画区间内部（会把已有的键吃掉）。
        var lastKey = (p.numKeys > 0) ? p.keyTime(p.numKeys) : -1;
        var EPS = 0.001;
        var killAfter = -1;   // >=0 时先删掉该时刻之后的所有旧键（在 undo group 内做）
        if (!reverse) {
            // 入场：若落点早于最后一个键，顺延到其后，避免把已打的动画覆盖掉
            if (t0 < lastKey - EPS) t0 = lastKey + EPS;
        } else if (p.numKeys > 0 && t0 <= lastKey + EPS) {
            // 出场：游标落在已有动画内部（或正好压在最后一个键上）
            var vAt = 100;
            try { vAt = p.valueAtTime(t0, false); } catch (e) { vAt = 100; }
            if (vAt >= 99 && t0 < lastKey - EPS) {
                // 停在「入场已走完」的平台段：清掉它后面的旧出场，就地重打 => 连点两次结果一致
                killAfter = t0;
            } else {
                // 还在入场动画中间，或正好压在末键上：顺延到最后一个键之后（+1ms），
                // 别把入场吃掉，也别和末键同刻
                t0 = lastKey + EPS;
            }
        }
        if (t0 + sec > comp.duration) t0 = Math.max(0, comp.duration - sec);
        app.beginUndoGroup("WE2 keyframes");
        if (killAfter >= 0) {
            for (var ki = p.numKeys; ki >= 1; ki--) {
                if (p.keyTime(ki) > killAfter + EPS) p.removeKey(ki);
            }
        }
        p.setValueAtTime(t0, reverse ? 100 : 0);
        p.setValueAtTime(t0 + sec, reverse ? 0 : 100);
        app.endUndoGroup();
    }

    // ------------------------------------------------------------------ 界面
    function buildUI(host) {
        var w = (host instanceof Panel) ? host : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
        w.orientation = "column"; w.alignChildren = ["fill", "top"]; w.spacing = 6; w.margins = 10;
        var ui = {}, syncing = false;

        function section(title) { var p = w.add("panel", undefined, title); p.orientation = "column"; p.alignChildren = ["fill", "top"]; p.margins = [10, 14, 10, 8]; p.spacing = 4; return p; }
        function row(parent, label, ctl) {
            var g = parent.add("group"); g.orientation = "row"; g.alignChildren = ["left", "center"];
            var s = g.add("statictext", undefined, label); s.preferredSize.width = 78; return g;
        }
        function sld(parent, label, mn, mx, val, ctlName, isInt) {
            var g = row(parent, label);
            var s = g.add("slider", undefined, val, mn, mx); s.alignment = ["fill", "center"]; s.preferredSize.width = 150;
            var e = g.add("edittext", undefined, String(val)); e.preferredSize.width = 44;
            function push(v) { e.text = String(isInt ? Math.round(v) : Math.round(v * 10) / 10); if (!syncing) setCtl(ctlName, isInt ? Math.round(v) : v); }
            s.onChanging = function () { push(s.value); };
            s.onChange = function () { push(s.value); };
            e.onChange = function () { var v = parseFloat(e.text); if (isNaN(v)) v = s.value; var cv = Math.max(mn, Math.min(mx, v)); s.value = cv; push(cv); };
            return { s: s, e: e, set: function (v) { s.value = Math.max(mn, Math.min(mx, v)); e.text = String(isInt ? Math.round(v) : Math.round(v * 10) / 10); } };
        }
        function txt(parent, label, val, key, multi) {
            var g = row(parent, label);
            var e = g.add("edittext", undefined, val, { multiline: !!multi });
            e.alignment = ["fill", "center"]; e.preferredSize = [multi ? 190 : 190, multi ? 44 : 22];
            e.onChange = function () { if (!syncing) { app.beginUndoGroup("WE2 text"); setText(key, e.text); app.endUndoGroup(); } };
            return e;
        }

        // 文本
        var pT = section("文字 Text");
        ui.top   = txt(pT, "顶部文字", "距填写倒计时文案", "top");
        ui.start = txt(pT, "起始文字", "大约还有", "start");
        ui.end   = txt(pT, "结束文字", "秒", "end");
        ui.sub   = txt(pT, "底部文字", "input countdown contents\nless than {n} {u}", "sub", true);
        pT.add("statictext", undefined, "底部文字里写 {n} = 当前数字，{u} = 单位，会随上面的数字实时变");
        ui.number = sld(pT, "倒计时数字", 0, 999, 30, "Number", true);
        ui.minDig = sld(pT, "最少位数", 0, 4, 0, "Min Digits", true);
        ui.unit = sld(pT, "单位 1年2月3周4天5时6分7秒", 1, 7, 7, "Unit", true);
        // 改单位时把「结束文字」同步成单位名（用户之后仍可手改）。
        // 关键：滑块和输入框两条路径都要覆盖 —— 只挂 s.onChange 的话，
        // 用户在输入框里敲数字回车，走的是 e.onChange，结束文字不会跟着变。
        function unitApply() {
            if (syncing) return;
            var nm = UNAMES[Math.max(1, Math.min(7, Math.round(ui.unit.s.value))) - 1];
            ui.end.text = nm;
            app.beginUndoGroup("WE2 unit"); setText("end", nm); app.endUndoGroup();
        }
        var unitSliderChange = ui.unit.s.onChange;
        ui.unit.s.onChange = function () { unitSliderChange(); unitApply(); };
        // e.onChange 是 sld() 内部挂的（负责把输入框值写回滑块/效果），先存再包一层
        var unitEditChange = ui.unit.e.onChange;
        ui.unit.e.onChange = function () { unitEditChange(); ui.unit.s.value = Math.max(1, Math.min(7, Math.round(ui.unit.s.value))); unitApply(); };

        // 自动倒数
        var pC = section("自动倒数 Countdown");
        pC.add("statictext", undefined, "倒数时长 = 0 时数字静止；大于 0 就从上面的数字倒数到 0");
        ui.countSec = sld(pC, "倒数时长 秒", 0, 120, 0, "Count Sec", false);
        ui.countStart = sld(pC, "开始时刻 秒", 0, 60, 0, "Count Start", false);

        // 动画
        var pA = section("动画 Animation");
        ui.progress = sld(pA, "入场进度", 0, 100, 100, "Progress", false);
        var gs = row(pA, "动画样式");
        ui.style = gs.add("dropdownlist", undefined, ["1  汇聚 Converge · 四面八方模糊汇入", "2  升起 Rise · 逐字上浮扫入", "3  展开 Expand · 由中心放大聚焦"]);
        ui.style.selection = 0; ui.style.alignment = ["fill", "center"];
        ui.style.onChange = function () { if (!syncing) setCtl("Style", ui.style.selection.index + 1); };
        ui.stagger = sld(pA, "错落程度", 0, 100, 55, "Stagger", true);
        ui.blur = sld(pA, "模糊量", 0, 200, 60, "Blur", true);
        ui.travel = sld(pA, "位移距离", 0, 600, 260, "Travel", true);
        ui.seed = sld(pA, "随机种子", 0, 99, 7, "Seed", true);
        ui.durSec = sld(pA, "入场时长 秒", 0.1, 10, 1.6, "Intro Sec", false);
        var gk = pA.add("group"); gk.orientation = "row";
        var bIn = gk.add("button", undefined, "打入场关键帧"); var bOut = gk.add("button", undefined, "打出场关键帧");
        bIn.onClick = function () { keyIntro(getCtl("Intro Sec", 1.6), false); };
        bOut.onClick = function () { keyIntro(getCtl("Intro Sec", 1.6), true); };

        // 版式
        var pS = section("版式 Style");
        ui.mainSp = sld(pS, "标题字距", -250, 250, -100, "__main", true);
        ui.subSp = sld(pS, "小字字距", -250, 250, 0, "__sub", true);
        ui.gap = sld(pS, "数字间距", -20, 60, 4, "Number Gap", true);
        ui.egap = sld(pS, "结尾间距", -20, 60, 4, "End Gap", true);
        ui.tscale = sld(pS, "整体缩放 %", 20, 400, 100, "Group Scale", true);
        // 字距是 TextDocument.tracking，不在效果里 —— 拖动时自己写回（松手才写，避免拖拽途中刷 undo）
        function spSync() {
            ui.mainSp.e.text = String(Math.round(ui.mainSp.s.value));
            ui.subSp.e.text = String(Math.round(ui.subSp.s.value));
        }
        function spApply() { if (!syncing) applyTracking(Math.round(ui.mainSp.s.value), Math.round(ui.subSp.s.value)); }
        ui.mainSp.s.onChanging = ui.subSp.s.onChanging = function () { spSync(); };
        ui.mainSp.s.onChange = ui.subSp.s.onChange = function () { spSync(); spApply(); };
        ui.mainSp.e.onChange = ui.subSp.e.onChange = function () {
            ui.mainSp.s.value = Math.max(-250, Math.min(250, parseFloat(ui.mainSp.e.text) || 0));
            ui.subSp.s.value = Math.max(-250, Math.min(250, parseFloat(ui.subSp.e.text) || 0));
            spSync(); spApply();
        };
        var gc = pS.add("group"); gc.orientation = "row";
        var bc1 = gc.add("button", undefined, "文字颜色"), bc2 = gc.add("button", undefined, "高亮颜色");
        bc1.onClick = function () { var c = pickColor(getCtl("Text Color", [1, 1, 1, 1])); if (c) setCtl("Text Color", c); };
        bc2.onClick = function () { var c = pickColor(getCtl("Highlight Color", [1, 0, 0, 1])); if (c) setCtl("Highlight Color", c); };
        var gf = pS.add("group"); gf.orientation = "column"; gf.alignChildren = ["fill", "top"];
        // 字体名不是某个图层的文案，不能走 txt() 的「打字即写入」路径
        // （原来传 key="__none"，打字时会调 setText("__none")，找不到层就静默返回，
        //  还平白刷一条 undo；改成纯输入框，由【应用字距 / 字体】统一生效）
        function fontField(parent, label, val) {
            var g = parent.add("group"); g.orientation = "row"; g.alignChildren = ["left", "center"];
            var s = g.add("statictext", undefined, label); s.preferredSize.width = 78;
            var e = g.add("edittext", undefined, val);
            e.alignment = ["fill", "center"]; e.preferredSize = [190, 22];
            return e;
        }
        ui.fMain = fontField(gf, "标题字体", FONT_MAIN);
        ui.fNum = fontField(gf, "数字字体", FONT_NUM);
        var bf = pS.add("button", undefined, "应用字距 / 字体");
        bf.onClick = function () {
            var r = applyStyle(cfg());
            if (r && r.failed && r.failed.length) {
                alert("字距已生效。\n但 AE 不允许直接替换已经有字体的文字层，以下字体没换成：\n\n" + r.failed.join("\n") +
                      "\n\n要换字体请点【创建 / 重建倒计时】—— 会重新生成文字层，之前打的入场关键帧需要重打。");
            }
        };

        function cfg() {
            return {
                top: ui.top.text, start: ui.start.text, end: ui.end.text, sub: ui.sub.text,
                number: Math.round(ui.number.s.value), style: ui.style.selection.index + 1,
                minDigits: Math.round(ui.minDig.s.value), unit: Math.round(ui.unit.s.value),
                mainSpacing: Math.round(ui.mainSp.s.value), subSpacing: Math.round(ui.subSp.s.value),
                fontMain: ui.fMain.text, fontNum: ui.fNum.text
            };
        }

        // 创建
        var gb = w.add("group"); gb.orientation = "row"; gb.alignChildren = ["fill", "center"];
        var bB = gb.add("button", undefined, "创建 / 重建倒计时");
        var bR = gb.add("button", undefined, "从合成读取");
        bB.onClick = function () { build(cfg()); sync(); };
        bR.onClick = function () { sync(); };

        function sync() {
            var comp = getComp(); if (!comp) return;
            var c = findLayer(comp, CTRL); if (!c) return;
            syncing = true;
            try {
                var keys = ["top", "start", "end", "sub"];
                for (var i = 0; i < keys.length; i++) { var t = readText(keys[i]); if (t !== null) ui[keys[i]].text = t; }
                ui.number.set(getCtl("Number", 30)); ui.minDig.set(getCtl("Min Digits", 0)); ui.progress.set(getCtl("Progress", 100));
                ui.stagger.set(getCtl("Stagger", 55)); ui.blur.set(getCtl("Blur", 60)); ui.travel.set(getCtl("Travel", 260));
                ui.seed.set(getCtl("Seed", 7)); ui.gap.set(getCtl("Number Gap", 4)); ui.egap.set(getCtl("End Gap", 4));
                ui.tscale.set(getCtl("Group Scale", 100));
                ui.countSec.set(getCtl("Count Sec", 0)); ui.countStart.set(getCtl("Count Start", 0));
                ui.unit.set(getCtl("Unit", 7));
                ui.durSec.set(getCtl("Intro Sec", 1.6));
                // 字距存在文字层的 TextDocument.tracking 里，不在控制器效果上
                function trkOf(key, dflt) {
                    var L = findLayer(comp, NAMES[key]); if (!L) return dflt;
                    try { return Math.round(L.property("ADBE Text Properties").property("ADBE Text Document").value.tracking); } catch (e3) { return dflt; }
                }
                ui.mainSp.set(trkOf("top", -100)); ui.subSp.set(trkOf("sub", 0));
                var sv = Math.round(getCtl("Style", 1)); if (sv >= 1 && sv <= 3) ui.style.selection = sv - 1;
                // 字体名从现有文字层读回来（用户可能已经换过）
                function fontOf(key, dflt) {
                    var L = findLayer(comp, NAMES[key]); if (!L) return dflt;
                    try { return L.property("ADBE Text Properties").property("ADBE Text Document").value.font; } catch (e4) { return dflt; }
                }
                ui.fMain.text = fontOf("start", FONT_MAIN);
                ui.fNum.text = fontOf("num", FONT_NUM);
            } catch (e) {}
            syncing = false;
        }

        w.layout.layout(true);
        w.onResizing = w.onResize = function () { this.layout.resize(); };
        // 把控件表挂在面板对象上，面板自己用（外部调试/自动化也能直接取控件，
        // 不必再调用 buildUI 造第二个窗口 —— 那在无头 / 批处理模式下会把 AE 挂死）
        try { w.ui = ui; } catch (eUI) {}
        return w;
    }

    // 供离线 / 真机自动化测试
    // 注意：必须放在「创建面板」之前，否则批处理模式（afterfx -r）会把面板真的弹出来，
    // 在没有交互的环境里挂住整个进程（实测 4 次探针全部卡死在这里）。
    if (typeof __WE_TEST__ !== "undefined") {
        __WE_TEST__.SCRIPT_NAME = SCRIPT_NAME;
        __WE_TEST__.CHAR = CHAR; __WE_TEST__.AMT = AMT; __WE_TEST__.WIN = WIN; __WE_TEST__.BAR = BAR;
        __WE_TEST__.posExpr = posExpr; __WE_TEST__.NUM_SRC = NUM_SRC; __WE_TEST__.SUB_SRC = SUB_SRC;
        __WE_TEST__.PRE = PRE; __WE_TEST__.UNIT_CORE = UNIT_CORE;
        __WE_TEST__.applyTracking = applyTracking; __WE_TEST__.applyStyle = applyStyle;
        __WE_TEST__.applyTextStyle = applyTextStyle;
        __WE_TEST__.getCtl = getCtl; __WE_TEST__.setCtl = setCtl;
        __WE_TEST__.build = build; __WE_TEST__.buildUI = buildUI;
        __WE_TEST__.setText = setText; __WE_TEST__.readText = readText;
        __WE_TEST__.keyIntro = keyIntro;
        __WE_TEST__.toColor = toColor; __WE_TEST__.fromColor = fromColor; __WE_TEST__.pickColor = pickColor;
        __WE_TEST__.NAMES = NAMES; __WE_TEST__.UNAMES = UNAMES; __WE_TEST__.TPL_LAYER = TPL_LAYER;
        __WE_TEST__.CTRL = CTRL; __WE_TEST__.SUL = SUL; __WE_TEST__.LY = LY;
        return;
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) { ui.center(); ui.show(); }

})(this);

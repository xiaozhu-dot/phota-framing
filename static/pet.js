// 小宠物：由"连续参数 + 弹簧物理"实时驱动，没有预制表情
//
// 结构分两层：
//   引擎（engine）：所有角色共用。负责眼神、情绪、眨眼、跳跃、被摸、说话等，算出一组数字 P
//   角色（SPECIES）：每个角色有自己的 SVG 外形和 render(P)，决定"这些数字怎么画在自己身上"
//     Crabo（螃蟹）：眼柄表达情绪，大钳子挥舞、说话时咔嚓开合，蝴蝶结会被甩动
//     Piggo（小猪）：耳朵、眼镜、鼻子表达情绪；需要"手"时伸出一只小蹄子
//   动作（引擎算数值，角色各自画）：睡觉（一直面朝你）、半睁眼、捂眼睛、指向、举手欢呼、
//     咔嚓（按快门）、憋气、挠头、点头、走到某个按钮旁边、拿道具（道具两个角色共用一套，
//     和宠物同样的扁平画法；托在身前或举到眼前，钳子 / 蹄子真的夹住它）
//   原则：宠物本体在所有动作里都是同一个样子，只是姿势和表情变化；道具拿在手上，不改变宠物本身
(function () {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Spring {
    constructor(x, k, d) { this.x = x; this.v = 0; this.target = x; this.k = k; this.d = d; }
    step(dt) {
      const a = (this.target - this.x) * this.k - this.v * this.d;
      this.v += a * dt;
      this.x += this.v * dt;
    }
    kick(v) { this.v += v; }
  }

  // 嘴型：s = 嘴角（-1 难过 ~ 1 开心），o = 张嘴程度
  function mouthPath(cx, cy, s, o, k = 1) {
    const w = (9 + o * 2) * k, corner = cy - s * 4.5 * k, mid = cy + s * 4 * k;
    return `M${cx - w} ${corner} Q${cx} ${mid - o * 2 * k} ${cx + w} ${corner} Q${cx} ${mid + o * 13 * k} ${cx - w} ${corner} Z`;
  }

  // 吃豆人形状：螃蟹的钳子，open 是张开的角度
  function clawPath(cx, cy, r, dir, open) {
    const a1 = ((dir + open / 2) * Math.PI) / 180, a2 = ((dir - open / 2) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 1 1 ${x2} ${y2} Z`;
  }

  // ======================= 角色 1：Crabo（戴蝴蝶结的螃蟹）=======================
  const crab = {
    name: "Crabo",
    lines: ["横着走也能拍好照片", "我的钳子也想按快门", "蝴蝶结今天正不正？"],
    markup: `
    <svg viewBox="0 0 200 200" role="img" aria-label="Crabo">
      <ellipse class="shadow" cx="100" cy="191" rx="64" ry="6"/>
      <g class="body">
        <g class="legs">
          <path d="M60 152 Q42 158 34 174"/><path d="M64 162 Q48 170 46 184"/><path d="M72 168 Q62 178 62 189"/>
          <path d="M140 152 Q158 158 166 174"/><path d="M136 162 Q152 170 154 184"/><path d="M128 168 Q138 178 138 189"/>
        </g>
        <g class="armL"><path class="arm" d="M48 132 Q30 124 28 98"/><path class="claw" d="M0 0"/></g>
        <g class="armR"><path class="arm" d="M152 132 Q170 124 172 98"/><path class="claw" d="M0 0"/></g>
        <g class="stalkL">
          <path class="stalk" d="M86 100 Q84 86 82 72"/>
          <ellipse class="white" cx="82" cy="64" rx="12" ry="12"/>
          <ellipse class="eye" cx="82" cy="65" rx="6" ry="7"/>
          <circle class="hi" cx="84.5" cy="61.5" r="2.2"/>
          <path class="arc" d="M75 67 Q82 58 89 67"/>
        </g>
        <g class="stalkR">
          <path class="stalk" d="M114 100 Q116 86 118 72"/>
          <ellipse class="white" cx="118" cy="64" rx="12" ry="12"/>
          <ellipse class="eye" cx="118" cy="65" rx="6" ry="7"/>
          <circle class="hi" cx="120.5" cy="61.5" r="2.2"/>
          <path class="arc" d="M111 67 Q118 58 125 67"/>
        </g>
        <path class="shell" d="M100 94 C150 94 166 118 166 140 C166 164 138 180 100 180 C62 180 34 164 34 140 C34 118 50 94 100 94 Z"/>
        <ellipse class="belly" cx="100" cy="164" rx="42" ry="12"/>
        <circle class="spot" cx="72" cy="114" r="3.2"/><circle class="spot" cx="64" cy="126" r="2"/>
        <circle class="spot" cx="140" cy="124" r="2.4"/>
        <g class="bow">
          <path class="bowc" d="M136 100 C122 86 112 94 115 103 C118 112 129 107 136 100 Z"/>
          <path class="bowc" d="M136 100 C150 86 160 94 157 103 C154 112 143 107 136 100 Z"/>
          <path class="bowc" d="M136 100 L129 116 L134 113.5 L136 117 Z"/>
          <path class="bowc" d="M136 100 L143 116 L138 113.5 L136 117 Z"/>
          <circle class="knot" cx="136" cy="100" r="5"/>
          <path class="bowhi" d="M119 99 Q121 94 126 94"/>
          <path class="bowhi" d="M146 94 Q151 94 153 99"/>
        </g>
        <g class="face">
          <ellipse class="blush" cx="70" cy="144" rx="10" ry="5.5"/>
          <ellipse class="blush" cx="130" cy="144" rx="10" ry="5.5"/>
          <path class="mouth"/>
          <circle class="anchor" cx="100" cy="142" r="1" fill="none"/>
        </g>
        <g class="prop"></g>
      </g>
    </svg>`,

    bind(svg) {
      const q = (s) => svg.querySelector(s), qa = (s) => [...svg.querySelectorAll(s)];
      const legs = qa(".legs path");
      return {
        face: q(".face"), legs, prop: q(".prop"), body: q(".body"),
        legRoots: legs.map((l) => l.getAttribute("d").match(/M(\d+) (\d+)/).slice(1).map(Number)),   // 每条腿绕根部转
        armL: q(".armL"), armR: q(".armR"),
        clawL: q(".armL .claw"), clawR: q(".armR .claw"), stalkL: q(".stalkL"), stalkR: q(".stalkR"),
        whites: qa(".white"), eyes: qa(".eye"), his: qa(".hi"), arcs: qa(".arc"), bow: q(".bow"),
        bowSpring: new Spring(0, 90, 6),                     // 蝴蝶结自己的弹簧：跳跃、歪头时被甩动
      };
    },

    render(p, P) {
      p.face.setAttribute("transform", `translate(${P.lx * 6} ${P.ly * 4})`);

      // 眼柄：情绪低落时向外耷拉，眼神方向时一起倾斜；捂眼睛时缩回壳边（真的螃蟹也会这样）
      const lean = P.lx * 12, sink = P.cover * 44;
      p.stalkL.setAttribute("transform", `translate(0 ${sink}) rotate(${-P.earL + lean} 86 100)`);
      p.stalkR.setAttribute("transform", `translate(0 ${sink}) rotate(${P.earR + lean} 114 100)`);
      [82, 118].forEach((bx, i) => {
        p.whites[i].setAttribute("ry", 12 * Math.max(P.open, 0.12));
        p.whites[i].style.opacity = 1 - P.joy * 0.15;
        const e = p.eyes[i];
        e.setAttribute("cx", bx + P.lx * 4);
        e.setAttribute("cy", 65 + P.ly * 4);
        e.setAttribute("rx", 6 * P.es);
        e.setAttribute("ry", 7 * P.es * P.open);
        const h = p.his[i];
        h.setAttribute("cx", bx + 2.5 * P.es + P.lx * 4);
        h.setAttribute("cy", 65 - 3.5 * P.es * P.open + P.ly * 4);
        h.style.opacity = P.open > 0.4 ? 1 : 0;
        p.arcs[i].style.opacity = P.joy;
      });

      // 大钳子：平时轻轻摆动，开心时高举挥舞；说话时咔嚓开合
      const wave = Math.sin(P.t * (1.6 + P.joy * 6)) * (5 + (P.joy + P.pet) * 14) * P.motion;
      const raise = P.joy * 22 + (P.mode === "excited" ? 14 : 0);
      // 右钳：指向 / 举起 / 拿道具时转到 P.reachAngle（屏幕角度，-90 = 正上方）；左钳挠头；两只一起捂眼睛
      const mix = (a, b, k) => a + (b - a) * k;
      const scratch = P.scratch * (40 + Math.sin(P.t * 18) * 9 * P.motion);
      const left = P.reachSide === "L";                            // 指向左边的东西用左钳
      // 拿道具：大多数道具两只钳子一起托在肚子前面（钳子夹住两边）；放大镜用右钳举到右眼前
      const eye = P.pose === "eye", hl = eye ? 0 : P.hold, hr = P.hold;
      const armL = mix(mix(mix(wave + raise + scratch, P.reachAngle + 114.4, left ? P.reach : 0), 40, P.cover), -165, hl);
      const armR = mix(mix(mix(-wave - raise, P.reachAngle + 59.5, left ? 0 : P.reach), -40, P.cover), eye ? -30 : 165, hr);
      p.armL.setAttribute("transform", `rotate(${armL} 48 132)`);
      p.armR.setAttribute("transform", `rotate(${armR} 152 132)`);
      // 拿着东西时钳子挪到壳前面，看起来是真的夹住；放下后回到壳后面
      const front = P.hold > 0.25;
      if (front !== p.armsFront) { p.armsFront = front; front ? p.body.append(p.armL, p.armR) : p.stalkL.before(p.armL, p.armR); }
      const [px, py] = eye ? [118 + P.lx * 4, 64 + P.ly * 4] : [100, 164];
      p.prop.setAttribute("transform", `translate(${px} ${py}) scale(${P.hold})`);
      const clack = (P.joy + (P.mode === "excited" ? 1 : 0)) * Math.abs(Math.sin(P.t * 9)) * 30 * P.motion;
      const open = Math.max(4, 18 + P.mouth * 46 + clack + P.reachOpen * 40 - Math.sin(P.snap * Math.PI) * 30 + P.cover * 10);
      p.clawL.setAttribute("d", clawPath(28, 88, 17, -120, open));
      p.clawR.setAttribute("d", clawPath(172, 88, 17, -60, open));

      // 小细腿：思考时和兴奋时会倒腾
      const legSpeed = P.mode === "excited" ? 16 : P.mode === "thinking" ? 7 : 2;
      const legAmp = (P.mode === "excited" ? 12 : P.mode === "thinking" ? 7 : 2.5) * P.motion;
      p.legs.forEach((leg, i) => {
        const side = i < 3 ? 1 : -1, [rx, ry] = p.legRoots[i];
        leg.setAttribute("transform", `rotate(${Math.sin(P.t * legSpeed + i * 1.3) * legAmp * side} ${rx} ${ry})`);
      });

      // 蝴蝶结：被跳跃和歪头"甩"起来，再自己弹回去
      p.bowSpring.target = clamp(P.hopV * 0.02 - P.tiltV * 0.12, -28, 28);
      p.bowSpring.step(P.dt);
      p.bow.setAttribute("transform", `rotate(${-12 + p.bowSpring.x} 136 100)`);

      p.mouth.setAttribute("d", mouthPath(100, 140, P.smile, P.mouth, 0.85));
    },
  };

  // ======================= 角色 2：Piggo（戴圆眼镜的小猪）=======================
  // 眼镜有自己的弹簧：跳起来时会被甩得往下滑，落地后再弹回去；低落时眼镜会滑到鼻梁上
  const pig = {
    name: "Piggo",
    lines: ["眼镜是用来看构图的", "哼哼，这张光线不错", "先扶一下眼镜……好了"],
    markup: `
    <svg viewBox="0 0 200 200" role="img" aria-label="Piggo">
      <ellipse class="shadow" cx="100" cy="191" rx="56" ry="6"/>
      <g class="body">
        <path class="ptail" d="M172 150 c12 -3 13 -15 4 -16 c-8 -1 -8 9 0 9"/>
        <g class="earL"><path class="skin" d="M48 82 Q30 48 56 38 Q76 46 88 64 Z"/><path class="pinner" d="M55 72 Q45 52 58 46 Q70 52 77 63 Z"/></g>
        <g class="earR"><path class="skin" d="M152 82 Q170 48 144 38 Q124 46 112 64 Z"/><path class="pinner" d="M145 72 Q155 52 142 46 Q130 52 123 63 Z"/></g>
        <path class="skin" d="M100 52 C152 52 176 90 176 128 C176 166 144 188 100 188 C56 188 24 166 24 128 C24 90 48 52 100 52 Z"/>
        <ellipse class="hoof" cx="74" cy="186" rx="14" ry="7"/>
        <ellipse class="hoof" cx="126" cy="186" rx="14" ry="7"/>
        <g class="face">
          <ellipse class="blush" cx="56" cy="136" rx="11" ry="6.5"/>
          <ellipse class="blush" cx="144" cy="136" rx="11" ry="6.5"/>
          <ellipse class="eye" cx="78" cy="108" rx="6" ry="7.5"/>
          <ellipse class="eye" cx="122" cy="108" rx="6" ry="7.5"/>
          <circle class="hi" cx="80" cy="105" r="2.2"/>
          <circle class="hi" cx="124" cy="105" r="2.2"/>
          <path class="arc" d="M71 110 Q78 102 85 110"/>
          <path class="arc" d="M115 110 Q122 102 129 110"/>
          <g class="glasses">
            <circle class="lens" cx="78" cy="108" r="17"/>
            <circle class="lens" cx="122" cy="108" r="17"/>
            <path class="frame" d="M95 106 Q100 100 105 106 M61 104 L44 97 M139 104 L156 97"/>
            <path class="lglint" d="M67 99 Q71 93 78 92 M111 99 Q115 93 122 92"/>
          </g>
          <g class="snout">
            <ellipse class="nose" cx="100" cy="137" rx="17" ry="12"/>
            <ellipse class="nostril" cx="94" cy="137" rx="2.6" ry="3.6"/>
            <ellipse class="nostril" cx="106" cy="137" rx="2.6" ry="3.6"/>
          </g>
          <path class="mouth"/>
          <circle class="anchor" cx="100" cy="157" r="1" fill="none"/>
        </g>
        <g class="prop"></g>
        <g class="hoofL"><ellipse class="hoof" cx="0" cy="0" rx="10" ry="12"/></g>
        <g class="hoofR"><ellipse class="hoof" cx="0" cy="0" rx="10" ry="12"/></g>
      </g>
    </svg>`,

    bind(svg) {
      const q = (s) => svg.querySelector(s), qa = (s) => [...svg.querySelectorAll(s)];
      return {
        hoofL: q(".hoofL"), hoofR: q(".hoofR"), prop: q(".prop"),
        face: q(".face"), earL: q(".earL"), earR: q(".earR"), tail: q(".ptail"), glasses: q(".glasses"), snout: q(".snout"),
        eyes: qa(".eye"), his: qa(".hi"), arcs: qa(".arc"),
        glassSpring: new Spring(0, 120, 7),                   // 眼镜自己的弹簧（往下滑多少像素）
      };
    },

    render(p, P) {
      p.face.setAttribute("transform", `translate(${P.lx * 7} ${P.ly * 5})`);
      // 大耳朵往前耷拉：低落时垂得更低
      p.earL.setAttribute("transform", `rotate(${-P.earL * 1.2} 68 66)`);
      p.earR.setAttribute("transform", `rotate(${P.earR * 1.2} 132 66)`);
      p.eyes.forEach((e, i) => {
        const bx = i ? 122 : 78;
        e.setAttribute("cx", bx + P.lx * 3);
        e.setAttribute("cy", 108 + P.ly * 2.5);
        e.setAttribute("rx", 6 * P.es);
        e.setAttribute("ry", 7.5 * P.es * P.open);
        const h = p.his[i];
        h.setAttribute("cx", bx + 2 * P.es + P.lx * 3);
        h.setAttribute("cy", 108 - 3 * P.es * P.open + P.ly * 2.5);
        h.style.opacity = P.open > 0.4 ? 1 : 0;
        p.arcs[i].style.opacity = P.joy;
      });
      // 眼镜：跳起来被甩下去、低落时滑到鼻梁上，然后弹回
      // 往上跳时眼镜"跟不上"往下滑，落下时往上颠一下（弹簧会让它晃几下再停）
      p.glassSpring.target = (P.earL > 8 ? 5 : 0) + clamp(-P.hopV * 0.012, -3, 7);
      p.glassSpring.step(P.dt);
      const gy = Math.max(-3, Math.min(9, p.glassSpring.x));
      p.glasses.setAttribute("transform", `translate(${P.lx * 1.5} ${gy})`);
      // 鼻子：说话时一拱一拱，平时偶尔嗅一嗅
      const sniff = Math.max(0, Math.sin(P.t * 2.1)) ** 12 * 0.08 * P.motion;
      const s = 1 + P.mouth * 0.08 + sniff;
      p.snout.setAttribute("transform", `translate(100 137) scale(${s} ${2 - s}) translate(-100 -137)`);
      p.mouth.setAttribute("d", mouthPath(100, 156, P.smile, P.mouth, 0.75));
      const wag = Math.sin(P.t * (2 + P.joy * 6)) * (10 + (P.joy + P.pet) * 14) * P.motion;
      p.tail.setAttribute("transform", `rotate(${wag} 172 150)`);
      p.glints = p.glints || p.glasses.querySelector(".lglint");
      p.glints.style.opacity = 0.7 + Math.sin(P.snap * Math.PI) * 0.3;   // 按快门：镜片闪一下
      // 小蹄子：平时收着；指向 / 举起 / 拿道具时伸出右蹄，挠头用左蹄，捂眼睛两只一起
      const mix = (a, b, k) => a + (b - a) * k, rad = (P.reachAngle * Math.PI) / 180;
      const left = P.reachSide === "L", rr = left ? 0 : P.reach, lr = left ? P.reach : 0;
      const rx = mix(150 + Math.cos(rad) * 30 * rr, 122, P.cover), ry = mix(146 + Math.sin(rad) * 30 * rr, 112, P.cover);
      const lx = mix(mix(50 + Math.cos(rad) * 30 * lr, 60, P.scratch), 78, P.cover), ly = mix(mix(146 + Math.sin(rad) * 30 * lr, 70 + Math.sin(P.t * 18) * 4 * P.motion, P.scratch), 112, P.cover);
      // 拿道具：抱在身前偏右（不挡嘴），两只蹄子按在两边；放大镜用右蹄举到右边镜片前
      const eye = P.pose === "eye", hl = eye ? 0 : P.hold, hr = P.hold;
      const [hrx, hry] = eye ? [150, 136] : [172, 172];
      p.hoofR.setAttribute("transform", `translate(${mix(rx, hrx, hr)} ${mix(ry, hry, hr)})`);
      p.hoofL.setAttribute("transform", `translate(${mix(lx, 112, hl)} ${mix(ly, 172, hl)})`);
      p.hoofR.style.opacity = Math.min(1, rr + P.cover + hr) > 0.05 ? 1 : 0;
      p.hoofL.style.opacity = Math.min(1, P.scratch + P.cover + lr + hl) > 0.05 ? 1 : 0;
      const [px, py] = eye ? [122 + P.lx * 3, 108 + P.ly * 2.5] : [142, 164];
      p.prop.setAttribute("transform", `translate(${px} ${py}) scale(${P.hold})`);
    },
  };

  const SPECIES = { crab, pig };

  const css = `
  .pet { --fur: #efc08f; --fur-2: #d99c63; --ear: #f0a7a4; --pet-ink: #2a2420; --mouth: #c65a5d;
         --shell: #f08468; --shell-2: #dd664d; --belly: #f8b49c; --bow: #e2557f; --bow-2: #c43d66;
         display: flex; flex-direction: column; align-items: center; user-select: none; }
  .pet svg { width: 200px; height: 200px; overflow: visible; cursor: pointer; touch-action: none; }
  .pet .fur { fill: var(--fur); }
  .pet .inner { fill: var(--ear); }
  .pet .dark { fill: var(--fur-2); }
  .pet .tail { fill: none; stroke: var(--fur-2); stroke-width: 13; stroke-linecap: round; }
  .pet .glass { fill: #2e333d; }
  .pet .glint { fill: #fff; opacity: .85; }
  .pet .eye { fill: var(--pet-ink); }
  .pet .hi { fill: #fff; }
  .pet .arc { fill: none; stroke: var(--pet-ink); stroke-width: 3.6; stroke-linecap: round; }
  .pet .mouth { fill: var(--mouth); stroke: var(--pet-ink); stroke-width: 3.2; stroke-linejoin: round; stroke-linecap: round; }
  .pet .blush { fill: #ef9f9c; }
  .pet .shadow { fill: currentColor; opacity: .13; }
  .pet .shell, .pet .claw { fill: var(--shell); }
  .pet .belly { fill: var(--belly); opacity: .7; }
  .pet .spot { fill: #fff; opacity: .35; }
  .pet .legs path, .pet .arm, .pet .stalk { fill: none; stroke: var(--shell-2); stroke-linecap: round; }
  .pet .legs path { stroke-width: 7; }
  .pet .arm { stroke-width: 9; }
  .pet .stalk { stroke-width: 6; }
  .pet .white { fill: #fff; }
  .pet .bowc { fill: var(--bow); }
  .pet .knot { fill: var(--bow-2); }
  .pet .bowhi { fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; opacity: .55; }
  .pet .skin { fill: #f5b4c0; }
  .pet .pinner { fill: #ea8fa1; }
  .pet .hoof, .pet .nose { fill: #ec97a8; }
  .pet .nostril { fill: #b5546a; }
  .pet .ptail { fill: none; stroke: #ec97a8; stroke-width: 4; stroke-linecap: round; }
  .pet .lens { fill: rgba(255,255,255,.18); stroke: #3a2f2c; stroke-width: 3.4; }
  .pet .frame { fill: none; stroke: #3a2f2c; stroke-width: 3.4; stroke-linecap: round; }
  .pet .lglint { fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; opacity: .7; }
  .pet .cap { min-height: 18px; margin-top: 6px; font: 12px/1.5 var(--mono, monospace);
              letter-spacing: .08em; color: var(--muted, #888); text-align: center; }
  .pet svg.enter { animation: pet-enter .5s cubic-bezier(.2, 1.4, .4, 1) both; }
  .pet .hoofL, .pet .hoofR { opacity: 0; }
  .pet .zzz text { font: 600 18px/1 var(--mono, monospace); fill: currentColor; opacity: 0; }
  .pet .pp-page { fill: #fbf3e4; } .pet .pp-page2 { fill: #efe2c8; }
  .pet .pp-line { fill: none; stroke: #dccbb0; stroke-width: 3; stroke-linecap: round; }
  .pet .pp-cover, .pet .pp-pink { fill: var(--bow); }
  .pet .pp-yellow { fill: #f3c25c; } .pet .pp-wood { fill: #f2d6b0; } .pet .pp-dark { fill: #4a3b33; }
  .pet .pp-rim { fill: none; stroke: #8a6450; stroke-width: 7; }
  .pet .pp-handle { fill: none; stroke: #8a6450; stroke-width: 9; stroke-linecap: round; }
  .pet .pp-glass { fill: rgba(200, 230, 255, .28); }
  .pet .pp-shine { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; opacity: .8; }
  .pet .pp-kraft { fill: #e3b16f; } .pet .pp-kraft2 { fill: #cf9a57; }
  .pet .pp-handle2 { fill: none; stroke: #b98448; stroke-width: 4; stroke-linecap: round; }
  .pet .pp-sky { fill: #a9cfe2; } .pet .pp-hill { fill: #8fbf8a; } .pet .pp-sun { fill: #f6d27a; }
  .pet .pp-write { animation: pp-write .5s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: 50% 100%; }
  @keyframes pp-write { from { transform: translate(-4px, 0) rotate(-8deg); } to { transform: translate(4px, 1px) rotate(6deg); } }
  .pet .pp-flip { animation: pp-flip 1.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 0% 50%; }
  @keyframes pp-flip { 0%, 30% { transform: scaleX(1); } 60%, 100% { transform: scaleX(-1); } }
  @media (prefers-reduced-motion: reduce) { .pet .pp-write, .pet .pp-flip { animation: none; } }
  @keyframes pet-enter { from { transform: scale(.3) translateY(30px); opacity: 0; } }`;

  // ======================= 引擎 =======================
  const DEFAULT_BASE = { smile: 0.3, ear: 0, eye: 1, eyeSize: 1, tilt: 0, blush: 0.3 };
  const S = {
    lid: new Spring(1, 40, 12),              // 眼皮：1 醒着，0.06 睡着，0.45 半睁
    lie: new Spring(0, 30, 9),               // 0 坐着，1 趴下睡
    hold: new Spring(0, 120, 12),            // 拿道具：0 空手，1 拿稳（道具从小弹到正常大小，钳子 / 蹄子跟过去托住）
    cover: new Spring(0, 90, 13),            // 捂眼睛
    reach: new Spring(0, 70, 11),            // 伸手（指向 / 举起 / 拿东西）
    reachOpen: new Spring(0, 70, 11),        // 伸手时钳子张开（欢呼）
    scratch: new Spring(0, 60, 10),          // 挠头
    puff: new Spring(0, 80, 11),             // 憋气鼓腮帮
    walkX: new Spring(0, 34, 11), walkY: new Spring(0, 34, 11),   // 走开的距离（屏幕像素）
    lookX: new Spring(0, 90, 13), lookY: new Spring(0, 90, 13),
    tilt: new Spring(0, 60, 9), squash: new Spring(0, 260, 12),
    eye: new Spring(1, 200, 20), eyeSize: new Spring(1, 80, 12),
    smile: new Spring(0.3, 60, 11), mouth: new Spring(0, 320, 22), blush: new Spring(0.3, 40, 10),
    earL: new Spring(0, 160, 10), earR: new Spring(0, 160, 10), joy: new Spring(0, 50, 10),
  };
  const state = {
    base: { ...DEFAULT_BASE }, mode: "idle",
    focus: null, focusUntil: 0, pointer: null, petting: 0, joyUntil: 0,
    hopY: 0, hopV: 0, nextHop: 0,
    blinkAt: -1e9, nextBlink: 1500, doubleBlink: false, nextTwitch: 3000,
    sleep: false, peek: false, reachAngle: -60, holding: false,
    snapAt: -1e9, scratchUntil: 0, coverOn: false, reachUntil: 0, reachOn: false,
  };

  let root, svg, cap, species, parts, common, mouthTimer, last = performance.now(), propName = null;

  // ======================= 道具：两个角色共用，和宠物一样的扁平画法（没有描边，靠深浅色分层）=======================
  //   以 (0,0) 为中心画，大约 64×42；放大镜以镜片中心为 (0,0)，举到眼睛前面
  const PENCIL = `<g transform="translate(24 2) rotate(30)"><g class="pp-write">
      <rect class="pp-yellow" x="-4" y="-24" width="8" height="28" rx="2"/><rect class="pp-pink" x="-4" y="-29" width="8" height="6" rx="2.5"/>
      <path class="pp-wood" d="M-4 4 L4 4 L0 13 Z"/><path class="pp-dark" d="M-1.4 10 L1.4 10 L0 13 Z"/></g></g>`;
  const PROPS = {
    magnifier: `<path class="pp-handle" d="M15 15 L30 30"/><circle class="pp-rim" r="20"/><circle class="pp-glass" r="15"/>
      <path class="pp-shine" d="M-9 -4 Q-8 -10 -2 -11"/>`,
    notes: `<rect class="pp-page" x="-28" y="-20" width="48" height="40" rx="5"/><path class="pp-pink" d="M-28 -12 L-28 -15 Q-28 -20 -23 -20 L15 -20 Q20 -20 20 -15 L20 -12 Z"/>
      <path class="pp-line" d="M-21 -3 H12 M-21 5 H8 M-21 13 H2"/>${PENCIL}`,
    book: `<rect class="pp-cover" x="-32" y="-22" width="64" height="44" rx="5"/><rect class="pp-page" x="-29" y="-19" width="28" height="38" rx="2"/>
      <rect class="pp-page" x="1" y="-19" width="28" height="38" rx="2"/><g class="pp-pages"></g>
      <g class="pp-flip"><rect class="pp-page2" x="1" y="-19" width="28" height="38" rx="2"/></g>`,
    bag: `<g class="pp-cards"></g><path class="pp-handle2" d="M-10 -12 Q-10 -26 0 -26 Q10 -26 10 -12"/>
      <path class="pp-kraft" d="M-27 -12 L27 -12 L30 21 L-30 21 Z"/><path class="pp-kraft2" d="M-27 -12 L27 -12 L27.6 -6 L-27.6 -6 Z"/>`,
    envelope: `<rect class="pp-page" x="-31" y="-20" width="62" height="40" rx="5"/><path class="pp-page2" d="M-30 -18 L0 5 L30 -18 Z"/>
      <path class="pp-pink" d="M0 11 C-7 5 -7 -1 -3 -1 C-1 -1 0 1 0 2 C0 1 1 -1 3 -1 C7 -1 7 5 0 11 Z"/>`,
    photo: `<g transform="rotate(-6)"><rect class="pp-page" x="-24" y="-22" width="48" height="44" rx="3"/><rect class="pp-sky" x="-19" y="-17" width="38" height="28" rx="1.5"/>
      <path class="pp-hill" d="M-19 11 L-19 3 Q-8 -6 2 4 Q10 -2 19 5 L19 11 Z"/><circle class="pp-sun" cx="10" cy="-9" r="4"/></g>`,
  };

  function pointOf(target) {
    if (!target) return null;
    if (target.getBoundingClientRect) {
      const r = target.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return target;
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
    last = now;
    const t = now / 1000, b = state.base;

    // 1. 眼神
    const r = svg.getBoundingClientRect();
    const fx = r.left + r.width / 2, fy = r.top + r.height * 0.5;
    let target = null;
    if (state.focus && now < state.focusUntil) target = pointOf(state.focus);
    else if (state.mode === "thinking") {
      S.lookX.target = Math.sin(t * 1.5) * 0.75;
      S.lookY.target = -0.55 + Math.sin(t * 0.8) * 0.12;
    } else if (state.pointer && now - state.pointer.t < 4000) target = state.pointer;
    else { S.lookX.target = Math.sin(t * 0.3) * 0.15; S.lookY.target = 0.05; }
    if (target) {
      const dx = target.x - fx, dy = target.y - fy, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 220);
      S.lookX.target = (dx / d) * m;
      S.lookY.target = (dy / d) * m;
    }

    // 2. 情绪 → 目标值
    state.petting *= Math.pow(0.3, dt);
    const pet = clamp(state.petting, 0, 1);
    S.joy.target = pet > 0.6 || now < state.joyUntil ? 1 : 0;
    S.smile.target = Math.max(b.smile, pet * 0.9);
    S.blush.target = clamp(b.blush + pet * 0.6, 0, 1);
    S.eye.target = b.eye;
    // 睡觉：眼皮合上、趴下；被点醒时半睁眼
    S.lid.target = state.sleep ? (state.peek ? 0.45 : 0.06) : 1;
    S.lie.target = state.sleep && !state.peek ? 1 : state.sleep ? 0.45 : 0;
    S.hold.target = state.holding ? 1 : 0;
    S.cover.target = state.coverOn ? 1 : 0;
    S.reach.target = state.reachOn || now < state.reachUntil ? 1 : 0;
    S.reachOpen.target = now < state.reachUntil && state.reachOpenOn ? 1 : 0;
    S.scratch.target = now < state.scratchUntil ? 1 : 0;
    S.puff.target = state.puffOn ? 1 : 0;
    S.eyeSize.target = state.mode === "excited" ? 1.18 : b.eyeSize;
    S.tilt.target = b.tilt + (state.mode === "thinking" && !reduceMotion ? Math.sin(t * 0.9) * 5 : 0);
    const ear = state.mode === "excited" ? -8 : b.ear >= 0 ? -b.ear * 6 : -b.ear * 22;
    S.earL.target = ear;
    S.earR.target = ear;

    // 3. 随机小动作
    if (now > state.nextBlink) {
      state.blinkAt = now;
      state.nextBlink = now + 2200 + Math.random() * 3800;
      state.doubleBlink = Math.random() < 0.2;
    }
    const bp = (now - state.blinkAt) / 150;
    const blink = bp >= 0 && bp < 1 ? 1 - Math.sin(bp * Math.PI) * 0.95 : 1;
    if (state.doubleBlink && bp > 1.6) { state.blinkAt = now; state.doubleBlink = false; }
    if (!reduceMotion && now > state.nextTwitch) {
      (Math.random() < 0.5 ? S.earL : S.earR).kick(250 + Math.random() * 200);
      state.nextTwitch = now + 3000 + Math.random() * 5000;
    }
    if (state.mode === "excited" && now > state.nextHop) { api.hop(0.55); state.nextHop = now + 520; }
    if (state.talking) S.mouth.target = 0.15 + 0.6 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 3.7));   // 朗读时嘴巴一张一合
    if (state.puffOn) S.smile.target = 0.05;                          // 憋气：嘴抿住

    // 4. 物理
    for (const k in S) S[k].step(dt);
    state.hopV += 2400 * dt;
    state.hopY += state.hopV * dt;
    if (state.hopY > 0) {
      if (state.hopV > 150) S.squash.kick(state.hopV * 0.004);
      state.hopY = 0;
      state.hopV = 0;
    }

    // 5. 共用部分：身体弹跳和压扁、影子、脸红；趴下、憋气、睡觉时慢慢呼吸
    const lie = clamp(S.lie.x, 0, 1), puff = clamp(S.puff.x, 0, 1);
    const breathe = reduceMotion ? 0 : Math.sin(t * (state.sleep ? 1.3 : 2.3)) * (state.sleep ? 0.03 : 0.014);
    const sq = S.squash.x + breathe - puff * 0.03, hy = state.hopY;
    common.body.setAttribute("transform",
      `translate(0 ${hy + lie * 12}) rotate(${S.tilt.x + lie * 6} 100 188) translate(100 188) scale(${1 + sq * 0.7 + puff * 0.04} ${(1 - sq) * (1 - lie * 0.14)}) translate(-100 -188)`);
    common.shadow.setAttribute("transform", `translate(100 191) scale(${(1 + hy / 140) * (1 + lie * 0.15)} 1) translate(-100 -191)`);
    common.blushes.forEach((e) => {
      e.style.opacity = 0.2 + clamp(S.blush.x + puff * 0.5, 0, 1) * 0.7;
      e.style.transformBox = "fill-box"; e.style.transformOrigin = "50% 50%";
      e.style.transform = puff > 0.02 ? `scale(${1 + puff * 0.45})` : "";
    });
    // Zzz：睡着（没被叫醒）时从头顶一个个冒出来
    common.zzz.forEach((z, i) => {
      const k = ((t * 0.45 + i / 3) % 1);
      const on = state.sleep && !state.peek ? 1 : 0;
      z.style.opacity = on * Math.sin(k * Math.PI) * 0.8;
      z.setAttribute("transform", `translate(${140 + k * 22 + i * 4} ${70 - k * 46 + lie * 12}) scale(${0.6 + k * 0.6})`);
    });
    // 走开：整个宠物平移（单位是屏幕像素，换算回自己的坐标）
    const scale = (r.width || 200) / 200;
    svg.style.translate = Math.abs(S.walkX.x) + Math.abs(S.walkY.x) > 0.5 ? `${S.walkX.x / scale}px ${S.walkY.x / scale}px` : "";

    // 6. 角色自己的部分
    const joy = clamp(S.joy.x, 0, 1);
    species.render(parts, {
      t, dt, mode: state.mode, pet, joy,
      lx: S.lookX.x, ly: S.lookY.x,
      open: clamp(S.eye.x * blink * clamp(S.lid.x, 0.06, 1) * (1 - Math.sin(clamp((now - state.snapAt) / 220, 0, 1) * Math.PI) * 0.8), 0.06, 1.3) * (1 - joy * 0.94), es: S.eyeSize.x,
      cover: clamp(S.cover.x, 0, 1), reach: clamp(S.reach.x, 0, 1), reachOpen: clamp(S.reachOpen.x, 0, 1),
      reachAngle: state.reachAngle, reachSide: state.reachSide, scratch: clamp(S.scratch.x, 0, 1),
      hold: Math.max(0, S.hold.x), pose: propName === "magnifier" ? "eye" : "chest",
      snap: clamp((now - state.snapAt) / 300, 0, 1) < 1 ? clamp((now - state.snapAt) / 300, 0, 1) : 0,
      smile: clamp(S.smile.x, -1.2, 1.2), mouth: clamp(S.mouth.x, 0, 1.2),
      earL: S.earL.x, earR: S.earR.x, hopV: state.hopV, tiltV: S.tilt.v,
      motion: reduceMotion ? 0 : 1,
    });

    if (!state.holding && propName && S.hold.x < 0.02) { propName = null; parts.prop.innerHTML = ""; }
    requestAnimationFrame(frame);
  }

  function useSpecies(name, animate) {
    species = SPECIES[name] || crab;
    root.querySelector("svg")?.remove();
    root.insertAdjacentHTML("afterbegin", species.markup);
    svg = root.querySelector("svg");
    if (animate) svg.classList.add("enter");
    parts = species.bind(svg);
    parts.mouth = svg.querySelector(".mouth");
    svg.insertAdjacentHTML("beforeend", `<g class="zzz" aria-hidden="true"><text>z</text><text>z</text><text>Z</text></g>`);
    common = {
      body: svg.querySelector(".body"), shadow: svg.querySelector(".shadow"),
      blushes: [...svg.querySelectorAll(".blush")], anchor: svg.querySelector(".anchor"),
      zzz: [...svg.querySelectorAll(".zzz text")],
    };
    if (propName) api.hold(propName);                         // 换角色时把道具交到新角色手上
    // 长按（约 0.6 秒）：交给页面处理（比如开关自动指导）；长按之后松手不算"戳一下"
    let pressTimer = 0, longPressed = false;
    svg.addEventListener("pointerdown", () => {
      longPressed = false;
      clearTimeout(pressTimer);
      if (!api.onLongPress) return;
      pressTimer = setTimeout(() => { longPressed = true; navigator.vibrate?.(18); api.onLongPress(); }, 600);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) svg.addEventListener(ev, () => clearTimeout(pressTimer));
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    // 在身上来回摸：越摸越开心
    svg.addEventListener("pointermove", (e) => {
      state.petting += Math.hypot(e.movementX || 0, e.movementY || 0) * 0.004;
    });
    // 戳一下：跳起来，说一句话（或复述一条建议）
    svg.addEventListener("click", () => {
      if (longPressed) { longPressed = false; return; }
      if (state.sleep) { if (api.onPoke) return api.onPoke(); return api.nudge(); }   // 睡着时被戳：不跳，交给页面（比如半睁眼给一次指导）
      api.hop(1);
      state.joyUntil = performance.now() + 700;
      if (api.onPoke) return api.onPoke();                  // 页面可以自己决定"戳她"之后做什么
      const pool = api.tips.length ? api.tips.map((t) => "记得：" + t) : [...species.lines, "多拍多练，会越拍越好的"];
      api.ambient(pool[Math.floor(Math.random() * pool.length)]);
    });
  }

  const api = {
    tips: [],
    onPoke: null,
    get name() { return species.name; },
    get species() { return Object.keys(SPECIES).find((k) => SPECIES[k] === species); },

    portrait(name) {
      const character = SPECIES[name] || crab;
      const holder = document.createElement('div');
      holder.innerHTML = character.markup;
      const portrait = holder.querySelector('svg');
      const bound = character.bind(portrait);
      bound.mouth = portrait.querySelector('.mouth');
      character.render(bound, { lx:0, ly:0, earL:0, earR:0, open:1, es:1, smile:.4, mouth:0,
        t:0, dt:1/60, hopV:0, tiltV:0, motion:0, joy:0, pet:0, mode:'idle',
        cover:0, reach:0, reachOpen:0, reachAngle:0, reachSide:1, scratch:0, hold:0, pose:'chest', snap:0 });
      portrait.setAttribute('aria-hidden', 'true');
      return portrait;
    },

    mount(container, name = "crab") {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
      root = document.createElement("div");
      root.className = "pet";
      root.innerHTML = `<div class="cap"></div>`;
      container.append(root);
      cap = root.querySelector(".cap");
      useSpecies(name, false);
      window.addEventListener("pointermove", (e) => {
        state.pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
      });
      requestAnimationFrame(frame);
    },

    // 切换角色：情绪和物理状态保留，只换"身体"
    setSpecies(name) {
      if (!SPECIES[name] || SPECIES[name] === species) return;
      useSpecies(name, !reduceMotion);
      state.joyUntil = performance.now() + 900;
    },

    mode(m) { state.mode = m; },
    // 正在朗读：嘴巴跟着动
    talk(on) {
      state.talking = on;
      if (!on) S.mouth.target = 0;
    },
    mood(partial) { Object.assign(state.base, partial); },
    reset() { state.base = { ...DEFAULT_BASE }; state.mode = "idle"; },
    caption(text) { cap.textContent = text; },
    lookAt(target, ms = 1e9) { state.focus = target; state.focusUntil = performance.now() + ms; },

    hop(power = 1) {
      if (state.hopY < -2) return;
      S.squash.kick(-2 * power);
      state.hopV = -520 * power;
    },
    celebrate() {
      api.hop(1);
      setTimeout(() => api.hop(0.8), 480);
      setTimeout(() => api.hop(0.6), 900);
      state.joyUntil = performance.now() + 1600;
    },
    shake() {
      S.tilt.kick(160);
      S.earL.kick(300);
      S.earR.kick(300);
    },

    // ===== 睡觉 =====
    get asleep() { return state.sleep; },
    // 先打个哈欠再趴下（一直面朝你睡）
    sleep(on) {
      if (on === state.sleep) return;
      if (on) {
        S.mouth.target = 1; clearTimeout(mouthTimer);
        mouthTimer = setTimeout(() => { S.mouth.target = 0; state.sleep = true; state.peek = false; }, reduceMotion ? 0 : 650);
      } else {
        clearTimeout(mouthTimer);
        state.sleep = false; state.peek = false;
        api.hop(0.5);
      }
    },
    // 睡着时被叫醒一下：半睁眼、稍微坐起来；peek(false) 再躺回去
    peek(on) {
      if (!state.sleep) return;
      state.peek = on;
    },
    // 睡着时被戳但页面没接手：翻个小身
    nudge() { S.tilt.kick(60); },

    // ===== 动作 =====
    // 按快门：螃蟹钳子咔嚓一合，小猪眨眼 + 镜片闪光
    snap() { state.snapAt = performance.now(); },
    // 指向屏幕上某个点或元素（ms 后放下）；open=true 时钳子张开（欢呼）
    point(target, ms = 1600, open = false) {
      const p = pointOf(target), r = svg.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
      state.reachSide = p && p.x < cx ? "L" : "R";
      state.reachAngle = p ? (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI : -80;
      if (state.reachSide === "L") state.reachAngle = clamp(state.reachAngle < 0 ? state.reachAngle : state.reachAngle - 360, -230, -100) ;
      else state.reachAngle = clamp(state.reachAngle, -80, 40);
      state.reachOpenOn = open;
      state.reachUntil = performance.now() + ms;
      if (p) api.lookAt(target, ms);
    },
    cheer(ms = 1400) { api.point(null, ms, true); state.joyUntil = performance.now() + ms; api.hop(0.6); },
    coverEyes(on) { state.coverOn = on; },
    holdBreath(on) {
      if (!on && state.puffOn) { S.mouth.target = 0.7; clearTimeout(mouthTimer); mouthTimer = setTimeout(() => (S.mouth.target = 0), 260); }   // 松一口气
      state.puffOn = on;
    },
    scratch(ms = 1400) { state.scratchUntil = performance.now() + ms; S.tilt.kick(-40); },
    nod() { S.lookY.kick(9); S.squash.kick(0.6); },
    perkUp() { S.earL.kick(-500); S.earR.kick(-500); api.hop(0.3); },
    // 拿着道具（null = 放下）；道具名见 PROPS
    hold(name) {
      if (!PROPS[name]) { state.holding = false; return; }          // 放下：先缩回去，缩完再清掉（frame 里）
      if (name !== propName || !parts.prop.innerHTML) { propName = name; parts.prop.innerHTML = PROPS[name]; S.hold.x = Math.min(S.hold.x, 0.3); }
      state.holding = true;
    },
    // 道具里的进度（书越来越厚 / 文件袋越来越鼓）：n = 0~1
    propFill(n) {
      const k = clamp(n, 0, 1);
      const pages = parts?.prop?.querySelector(".pp-pages"), cards = parts?.prop?.querySelector(".pp-cards");
      // 书：照片一张张贴到书页上；文件袋：卡片一张张冒出袋口
      const slots = [[-26, -16], [-26, 2], [4, -16], [4, 2]];
      if (pages) pages.innerHTML = slots.slice(0, Math.round(k * 4)).map(([x, y]) => `<rect class="pp-sky" x="${x}" y="${y}" width="22" height="14" rx="1.5"/>`).join("");
      if (cards) cards.innerHTML = Array.from({ length: Math.round(k * 4) }, (_, i) => `<g transform="translate(${-15 + i * 9} ${-14 - (i % 2) * 4}) rotate(${-8 + i * 6})"><rect class="pp-page" x="-7" y="-10" width="14" height="16" rx="1.5"/><rect class="pp-sky" x="-5" y="-8" width="10" height="8"/></g>`).join("");
    },
    // 走到某个元素旁边（返回 Promise，大约 0.6 秒到）；不传参数 = 走回原位。减少动态效果时不走
    walkTo(target, { dx = 0, dy = 0 } = {}) {
      if (reduceMotion) return Promise.resolve();
      const r = svg.getBoundingClientRect();
      const home = { x: r.left + r.width / 2 - S.walkX.x, y: r.top + r.height / 2 - S.walkY.x };
      const p = target ? pointOf(target) : null;
      S.walkX.target = p ? p.x + dx - home.x : 0;
      S.walkY.target = p ? p.y + dy - home.y : 0;
      for (let i = 0; i < 3; i++) setTimeout(() => api.hop(0.35), i * 200);   // 一蹦一蹦地走过去
      return new Promise((done) => setTimeout(done, 650));
    },

    mouthPoint() {
      const r = common.anchor.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    emit(target) {
      api.lookAt(target, 700);
      S.mouth.target = 1;
      clearTimeout(mouthTimer);
      mouthTimer = setTimeout(() => (S.mouth.target = 0), 170);
      S.squash.kick(-1.2);
      if (state.hopY === 0) state.hopV = -120;
      return api.mouthPoint();
    },

    ambient(text) {
      const p = api.mouthPoint();
      const b = document.createElement("div");
      b.className = "bubble ambient";
      b.textContent = text;
      document.body.append(b);
      const w = b.offsetWidth, h = b.offsetHeight;
      const k = Math.max(0.3, Math.min(1, (p.y - 40) / 130));     // 离屏幕顶部太近时少飘一点，别飘出屏幕
      const at = (dx, dy, s) => `translate(${p.x - w / 2 + dx}px, ${p.y - h / 2 + dy * k}px) scale(${s})`;
      S.mouth.target = 1;
      setTimeout(() => (S.mouth.target = 0), 200);
      b.animate(
        [
          { transform: at(0, 0, 0.3), opacity: 0 },
          { transform: at(-6, -70, 1), opacity: 1, offset: 0.25 },
          { transform: at(6, -110, 1), opacity: 1, offset: 0.8 },
          { transform: at(0, -130, 1.08), opacity: 0 },
        ],
        { duration: 2600, easing: "cubic-bezier(.2,.7,.3,1)" }
      ).onfinish = () => b.remove();
    },
  };

  window.pet = api;
})();

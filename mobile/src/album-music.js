// 摄影集的配乐：用浏览器自带的合成器（Web Audio）现场"演奏"，不用音频文件
//   好处：没有版权问题、不占体积；而且由随机种子决定调性、和弦走向和旋律 —— 每本摄影集的曲子都不一样
//
// 这个函数会被原样放进导出的 HTML 里运行（album-template.js 用 toString() 装进去），所以不能引用外面的任何东西
export function albumMusic() {
  // 每种风格的"编曲"：速度、拍子、调式、和弦走向（用级数写：1 = 主和弦）、主奏乐器、伴奏型、背景声
  const STYLES = {
    dawn:   { bpm: 68,  beats: 4, mode: "major",  progs: [[1, 5, 6, 4], [1, 6, 4, 5], [4, 1, 5, 6]], lead: "piano",    arp: [0, 1, 2, 1], perBeat: 2, melody: 0.32, pad: 0.05 },
    sea:    { bpm: 56,  beats: 4, mode: "lydian", progs: [[1, 2, 1, 5], [1, 5, 2, 1], [4, 1, 2, 5]], lead: "bell",     arp: [0, 2, 1, 2], perBeat: 1, melody: 0.22, pad: 0.07, texture: "waves" },
    rain:   { bpm: 74,  beats: 4, mode: "dorian", progs: [[2, 5, 1, 6], [1, 4, 2, 5], [6, 2, 5, 1]], lead: "rhodes",   comp: true, sevenths: true, melody: 0.26, pad: 0.035, texture: "rain", swing: 0.16, hat: true },
    summer: { bpm: 100, beats: 4, mode: "major",  progs: [[1, 4, 5, 4], [1, 5, 6, 4], [4, 5, 1, 1]], lead: "marimba",  arp: [0, 1, 2, 1, 0, 2, 1, 2], perBeat: 2, melody: 0.42, pad: 0.025, shaker: true },
    snow:   { bpm: 84,  beats: 3, mode: "major",  progs: [[1, 6, 4, 5], [1, 3, 4, 5], [6, 4, 1, 5]], lead: "musicbox", waltz: true, melody: 0.5, pad: 0.035 },
    film:   { bpm: 62,  beats: 4, mode: "aeolian",progs: [[1, 6, 3, 7], [1, 4, 6, 5], [6, 7, 1, 1]], lead: "piano",    arp: [0, 1, 2, 3], perBeat: 1, melody: 0.3, pad: 0.05, texture: "vinyl", wobble: true },
  };
  const MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  };

  // 可重复的随机数：同一个种子 → 同一首曲子；种子不同 → 曲子不同
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function create(styleName, seed) {
    const S = STYLES[styleName] || STYLES.film;
    const rand = rng(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const root = 55 + Math.floor(rand() * 9);                       // 随机调：G3 ~ D#4 之间
    const scale = MODES[S.mode];
    const note = (i) => root + 12 * Math.floor(i / 7) + scale[((i % 7) + 7) % 7];   // 第 i 个音阶音（可以跨八度）
    const chordOf = (deg) => {
      const i = deg - 1;
      return (S.sevenths ? [0, 2, 4, 6] : [0, 2, 4]).map((k) => note(i + k));
    };
    let prog = pick(S.progs);
    let ctx = null, out, wet, timer = 0, playing = false, intensity = 0.6;
    let step = 0, next = 0, lastMel = 7 + Math.floor(rand() * 3);
    const spb = 60 / S.bpm;

    // ---- 声音的"房间"：混响（用一段慢慢衰减的噪声当作房间的回声）----
    function reverb(seconds) {
      const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
      }
      const c = ctx.createConvolver();
      c.buffer = buf;
      return c;
    }
    let noiseBuf = null;
    function noise() {
      if (!noiseBuf) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      return s;
    }

    function setup() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.connect(ctx.destination);
      out = ctx.createGain();
      out.gain.value = 0;
      out.connect(comp);
      const rv = reverb(S.lead === "bell" || S.lead === "musicbox" ? 3.8 : 2.8);
      wet = ctx.createGain();
      wet.gain.value = 0.42;
      wet.connect(rv);
      rv.connect(out);
      // 磁带的"走带不稳"：整体音高轻轻晃
      if (S.wobble) {
        S._wob = ctx.createOscillator();
        S._wob.frequency.value = 0.6;
        S._wobGain = ctx.createGain();
        S._wobGain.gain.value = 5;                                     // ±5 音分
        S._wob.connect(S._wobGain);
        S._wob.start();
      }
      startTexture();
    }

    // 一个音符：乐器 → 音量包络 → 直达声 + 混响
    function play(inst, midi, t, vel, len) {
      const f = hz(midi);
      const g = ctx.createGain();
      g.connect(out);
      g.connect(wet);
      const partial = (ratio, amp, type = "sine", decay = len) => {
        const o = ctx.createOscillator(), a = ctx.createGain();
        o.type = type;
        o.frequency.value = f * ratio;
        if (S._wobGain) S._wobGain.connect(o.detune);
        a.gain.setValueAtTime(0, t);
        a.gain.linearRampToValueAtTime(amp, t + 0.006);
        a.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(a).connect(g);
        o.start(t);
        o.stop(t + decay + 0.05);
      };
      g.gain.value = vel;
      if (inst === "piano") { partial(1, 0.6, "triangle", len); partial(2, 0.18, "sine", len * 0.5); partial(3, 0.05, "sine", len * 0.25); }
      else if (inst === "bell") { partial(1, 0.5, "sine", len); partial(2.76, 0.16, "sine", len * 0.6); partial(5.4, 0.06, "sine", len * 0.25); }
      else if (inst === "musicbox") { partial(2, 0.5, "sine", len); partial(4, 0.12, "sine", len * 0.4); partial(6.02, 0.04, "sine", 0.18); }
      else if (inst === "marimba") { partial(1, 0.7, "sine", len); partial(3.98, 0.12, "sine", 0.12); partial(10, 0.03, "sine", 0.04); }
      else if (inst === "rhodes") {
        partial(1, 0.55, "sine", len); partial(2, 0.14, "sine", len * 0.7); partial(7, 0.03, "sine", 0.08);
        const trem = ctx.createOscillator(), tg = ctx.createGain();       // 电钢琴的颤音
        trem.frequency.value = 4.5; tg.gain.value = vel * 0.25;
        trem.connect(tg).connect(g.gain); trem.start(t); trem.stop(t + len);
      } else if (inst === "bass") { partial(0.5, 0.7, "sine", len); partial(1, 0.12, "triangle", len * 0.6); }
    }

    // 长音铺底：两个略微走音的锯齿波 + 低通滤波，柔和的"弦乐垫子"
    function pad(chord, t, len) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 700;
      f.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(S.pad, t + len * 0.35);
      g.gain.linearRampToValueAtTime(0, t + len + 0.6);
      f.connect(g);
      g.connect(out);
      g.connect(wet);
      for (const m of chord) for (const cents of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(m);
        o.detune.value = cents;
        o.connect(f);
        o.start(t);
        o.stop(t + len + 0.7);
      }
    }

    function tick(t, vel, hp) {                                       // 沙锤 / 踩镲：一小段高通噪声
      const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "highpass";
      f.frequency.value = hp;
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random());
      s.stop(t + 0.08);
    }

    // 背景声：海浪 / 雨 / 唱片底噪
    function startTexture() {
      if (!S.texture) return;
      const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(out);
      if (S.texture === "waves") {
        f.type = "lowpass";
        f.frequency.value = 420;
        const lfo = ctx.createOscillator(), depth = ctx.createGain();   // 浪一阵一阵地涌上来
        lfo.frequency.value = 0.09;
        depth.gain.value = 0.05;
        lfo.connect(depth).connect(g.gain);
        lfo.start();
        g.gain.value = 0.07;
      } else if (S.texture === "rain") {
        f.type = "bandpass";
        f.frequency.value = 2400;
        f.Q.value = 0.4;
        g.gain.value = 0.045;
      } else {
        f.type = "highpass";
        f.frequency.value = 3000;
        g.gain.value = 0.006;
        S._crackle = true;
      }
      s.start();
    }

    // ---- 排程：提前 0.3 秒把要响的音排好（JS 定时器不准，音频时钟很准）----
    function schedule() {
      const eighth = spb / 2;
      while (next < ctx.currentTime + 0.3) {
        const per = S.beats * 2, bar = Math.floor(step / per), pos = step % per;
        if (pos === 0 && bar > 0 && bar % 8 === 0) prog = pick(S.progs);   // 每 8 小节换一种和弦走向
        const chord = chordOf(prog[bar % prog.length]);
        const t = next, barLen = spb * S.beats;

        if (pos === 0) {
          pad(chord.map((m) => m - 12), t, barLen);
          play("bass", chord[0] - 12, t, 0.55, spb * (S.waltz ? 1.4 : 2.6));
        }
        if (S.waltz && (pos === 2 || pos === 4)) for (const m of chord.slice(1)) play("musicbox", m - 12, t, 0.12, 1.1);
        if (S.comp && (pos === 0 || pos === 3)) chord.forEach((m, k) => play("rhodes", m, t + k * 0.012, pos ? 0.11 : 0.15, spb * 1.6));
        if (S.arp && pos % (2 / S.perBeat) === 0) {
          const i = (pos * S.perBeat) / 2;
          play(S.lead, chord[S.arp[i % S.arp.length] % chord.length] + 12, t, 0.13 * (0.6 + intensity * 0.6), S.perBeat === 2 ? 1.1 : 2.2);
        }
        if (S.hat && pos % 2 === 1) tick(t, 0.025 + rand() * 0.02, 7000);
        if (S.shaker) tick(t, pos % 2 ? 0.02 : 0.035, 5000);
        if (S._crackle && rand() < 0.35) tick(t + rand() * eighth, 0.01 + rand() * 0.03, 2500);

        // 旋律：在五声音阶上"散步"，强拍尽量落在和弦音上；页面心情越活泼，音符越多
        if (pos % 2 === 0 && rand() < S.melody * (0.5 + intensity)) {
          let n = lastMel + pick([-2, -1, -1, 1, 1, 2, 0]);
          n = Math.max(5, Math.min(13, n));
          const pentaOK = [0, 1, 2, 4, 5].includes(((n % 7) + 7) % 7) || S.mode !== "major";
          if (!pentaOK) n += 1;
          lastMel = n;
          const midi = pos === 0 ? nearestChordTone(note(n), chord) : note(n);
          play(S.lead, midi + 12, t + (S.swing ? 0.01 : 0), 0.18, S.lead === "marimba" ? 0.9 : 2.4);
        }

        const swing = S.swing ? (step % 2 ? 1 - S.swing : 1 + S.swing) : 1;
        next += eighth * swing;
        step++;
      }
      timer = setTimeout(schedule, 60);
    }
    const nearestChordTone = (m, chord) => {
      let best = m, d = 99;
      for (const c of chord) for (const o of [0, 12, 24]) { const x = c + o; if (Math.abs(x - m) < d) { d = Math.abs(x - m); best = x; } }
      return best;
    };

    return {
      get playing() { return playing; },
      async start() {
        if (!ctx) setup();
        await ctx.resume();
        if (playing) return;
        playing = true;
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0.75, ctx.currentTime, 1.2);         // 慢慢淡入
        next = ctx.currentTime + 0.1;
        schedule();
      },
      stop() {
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);            // 淡出
      },
      // 翻页：一串轻轻的上行音，像风铃；心情决定后面的音乐密不密
      turn(mood) {
        intensity = { lively: 1, warm: 0.7, calm: 0.45, wistful: 0.35 }[mood] ?? 0.6;
        if (!playing) return;
        const t = ctx.currentTime + 0.02, chord = chordOf(prog[0]);
        chord.slice(0, 3).forEach((m, i) => play(S.lead, m + 24, t + i * 0.09, 0.08, 1.6));
      },
      pause() { if (ctx && playing) ctx.suspend(); },
      resume() { if (ctx && playing) ctx.resume(); },
      describe: () => ({ key: ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][root % 12], bpm: S.bpm }),
    };
  }

  window.AlbumMusic = { create, styles: Object.keys(STYLES) };
}

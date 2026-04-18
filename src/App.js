import React, { useState, useMemo } from 'react';
import { Calculator, ShieldAlert, ShieldCheck, Ruler, Waves, Wind, Layers, Settings2, Info, RotateCcw, MoveHorizontal, ArrowDownToLine, TriangleRight, Sparkles, Bot, Loader2 } from 'lucide-react';

const App = () => {
  // 1. 상태 관리 (State)
  const [inputs, setInputs] = useState({
    // 기하 구조 (m)
    H: 4.0,    // 옹벽 전고
    t1: 0.4,   // 벽체 상단 두께
    t2: 0.5,   // 벽체 하단 두께
    B: 3.0,    // 저판 폭
    D: 0.6,    // 저판 두께
    Bt: 0.8,   // 앞굽 폭 (Toe)
    
    // 배면 헌치 (Haunch)
    useHaunch: false,
    Hh: 0.3,   // 헌치 높이 (m)
    Bh_haunch: 0.3, // 헌치 폭 (m)
    
    // 재료 및 토사 제원
    fck: 24,   // 콘크리트 강도 (MPa)
    gammaC: 24.5, // 콘크리트 단위중량 (kN/m3)
    gammaS: 19.0, // 토사 단위중량 (kN/m3)
    phi: 30,      // 내부마찰각 (deg)
    q_surcharge: 10.0, // 상재하중 (kN/m2)
    qa: 200,      // 허용지지력 (kN/m2)
    frictionCoeff: 0.5, // 저판 마찰계수
    
    // 방음벽 추가 하중
    noiseBarrierWeight: 1.5, // 방음벽 고정하중 (kN/m)
    noiseBarrierHeight: 3.0, // 방음벽 높이 (m)
    windPressure: 1.2,       // 설계풍압 (kN/m2)

    // 활동방지벽 (Shear Key)
    useShearKey: false,
    Hk: 0.6,  // 활동방지벽 깊이 (m)
    tk: 0.4,  // 활동방지벽 두께 (m)
    Xk: 0.5,  // 앞굽 끝단에서 활동방지벽까지의 거리 (m)
  });

  // AI 분석 상태 관리
  const [aiReport, setAiReport] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInputs(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : (parseFloat(value) || 0) 
    }));
    // 치수 변경 시 기존 AI 리포트 초기화
    if (aiReport) setAiReport(null);
  };

  // 2. 구조 계산 로직
  const results = useMemo(() => {
    const { 
      H, t1, t2, B, D, Bt, gammaC, gammaS, phi, q_surcharge, qa, frictionCoeff, 
      noiseBarrierWeight, noiseBarrierHeight, windPressure,
      useShearKey, Hk, tk, Xk,
      useHaunch, Hh, Bh_haunch
    } = inputs;
    
    const Hw = H - D;      // 벽체 높이
    
    // 전면 경사 (1:0.02 고정)
    const frontBatter = 0.02;
    const dx_front = Hw * frontBatter;
    const db_back = t2 - dx_front - t1; // 배면 수평 경사량

    // 주동 및 수동 토압계수 (Rankine)
    const phiRad = (phi * Math.PI) / 180;
    const Ka = Math.pow(Math.tan(Math.PI / 4 - phiRad / 2), 2);
    const Kp = Math.pow(Math.tan(Math.PI / 4 + phiRad / 2), 2);
    
    // --- 연직하중 (V) 및 저항모멘트 (Mr) 계산 (검토원점: 앞굽 끝단 하부) ---
    const W1 = 0.5 * dx_front * Hw * gammaC; 
    const x1 = Bt + (2/3) * dx_front;
    const M1 = W1 * x1;
    
    const W2 = t1 * Hw * gammaC; 
    const x2 = Bt + dx_front + t1 / 2;
    const M2 = W2 * x2;
    
    const W3 = 0.5 * db_back * Hw * gammaC; 
    const x3 = Bt + dx_front + t1 + db_back / 3;
    const M3 = W3 * x3;
    
    const W_base = B * D * gammaC;
    const x_base = B / 2;
    const M_base = W_base * x_base;
    
    const Bh = B - Bt - t2; 
    const W_soil_rect = Bh * Hw * gammaS;
    const x_soil_rect = B - Bh / 2;
    const M_soil_rect = W_soil_rect * x_soil_rect;
    
    const W_soil_tri = 0.5 * db_back * Hw * gammaS;
    const x_soil_tri = Bt + t2 - db_back / 3;
    const M_soil_tri = W_soil_tri * x_soil_tri;
    
    const top_soil_width = B - Bt - dx_front - t1;
    const W_q = q_surcharge * top_soil_width;
    const x_q = B - top_soil_width / 2;
    const M_q = W_q * x_q;
    
    const Wnb = noiseBarrierWeight;
    const xnb = Bt + dx_front + t1 / 2; 
    const Mnb = Wnb * xnb;

    let W_haunch = 0, M_haunch = 0;
    if (useHaunch) {
      const haunch_area = 0.5 * Bh_haunch * Hh;
      W_haunch = haunch_area * (gammaC - gammaS);
      const x_haunch = Bt + t2 + Bh_haunch / 3;
      M_haunch = W_haunch * x_haunch;
    }

    let Wk = 0, Mk = 0, Pp = 0;
    if (useShearKey) {
      Wk = tk * Hk * gammaC;
      const xk_center = Xk + tk / 2;
      Mk = Wk * xk_center;

      const q_passive = gammaC * D; 
      Pp = (0.5 * gammaS * Kp * Math.pow(Hk, 2)) + (q_passive * Kp * Hk);
    }

    const V_total = W1 + W2 + W3 + W_base + W_soil_rect + W_soil_tri + W_q + Wnb + W_haunch + Wk;
    const Mr_total = M1 + M2 + M3 + M_base + M_soil_rect + M_soil_tri + M_q + Mnb + M_haunch + Mk;

    // --- 수평하중 (H) 및 전도모멘트 (Mo) 계산 ---
    const Pa = 0.5 * Ka * gammaS * Math.pow(H, 2);
    const Mo_pa = Pa * (H / 3);
    
    const Pq = Ka * q_surcharge * H;
    const Mo_pq = Pq * (H / 2);
    
    const Pw = windPressure * noiseBarrierHeight;
    const Mo_pw = Pw * (H + noiseBarrierHeight / 2);

    const H_total = Pa + Pq + Pw;
    const Mo_total = Mo_pa + Mo_pq + Mo_pw;

    // --- 안정성 검토 ---
    const FSo = Mr_total / Mo_total;
    const R_sliding = (V_total * frictionCoeff) + Pp;
    const FSs = R_sliding / H_total;
    
    const d = (Mr_total - Mo_total) / V_total; 
    const e = Math.abs(B / 2 - d); 
    
    let q1, q2;
    if (e <= B / 6) {
      q1 = (V_total / B) * (1 + 6 * e / B);
      q2 = (V_total / B) * (1 - 6 * e / B);
    } else {
      q1 = (2 * V_total) / (3 * d);
      q2 = 0;
    }
    const q_max = Math.max(q1, q2);

    return {
      FSo, FSs, q_max, e, B_6: B/6,
      V_total, H_total, Mr_total, Mo_total, Pp, R_sliding,
      isFSoOk: FSo >= 2.0,
      isFSsOk: FSs >= 1.5,
      isQaOk: q_max <= qa,
      isEccOk: e <= B/6
    };
  }, [inputs]);

  // 3. Gemini API 연동 (AI 설계 자문)
  const fetchWithRetry = async (url, options, retries = 5) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  const handleAiAnalysis = async () => {
    setIsAiLoading(true);
    setAiError(null);
    const apiKey = ""; // Canvas 환경에서 자동 주입됨
    
    const prompt = `
당신은 20년 경력의 수석 토목구조기술사입니다.
다음은 방음벽이 설치된 L형 옹벽의 구조계산 데이터입니다. 이 데이터를 철저히 분석하여 아래 3가지 항목에 대한 자문 보고서를 작성해주세요.

[설계 입력값]
- 옹벽 제원: 높이(H)=${inputs.H}m, 저판 폭(B)=${inputs.B}m, 벽체 하단 두께(t2)=${inputs.t2}m
- 지반 조건: 토사 단위중량=${inputs.gammaS}kN/m³, 내부마찰각=${inputs.phi}도, 허용지지력=${inputs.qa}kN/m²
- 특수 하중: 상재하중=${inputs.q_surcharge}kN/m², 방음벽 자중=${inputs.noiseBarrierWeight}kN/m, 풍하중=${inputs.windPressure}kN/m²
- 추가 보강: 활동방지벽 ${inputs.useShearKey ? '적용' : '미적용'}, 배면 헌치 ${inputs.useHaunch ? '적용' : '미적용'}

[안정성 검토 결과]
- 전도 안전율: ${results.FSo.toFixed(2)} (기준 2.0 이상 -> ${results.isFSoOk ? '만족' : '불만족'})
- 활동 안전율: ${results.FSs.toFixed(2)} (기준 1.5 이상 -> ${results.isFSsOk ? '만족' : '불만족'})
- 지지력(최대지반압): ${results.q_max.toFixed(2)} kN/m² (허용치 ${inputs.qa} kN/m² -> ${results.isQaOk ? '만족' : '불만족'})
- 편심량: ${results.e.toFixed(4)}m (허용치 ${results.B_6.toFixed(4)}m 이하 -> ${results.isEccOk ? '만족' : '불만족'})

[작성 요구사항]
1. 전반적인 안정성 평가: 현재 설계의 안전율 여유도 및 위험 요소 분석
2. 설계 최적화 제안: 비경제적인 치수가 있다면 줄일 곳을 추천하고, 안전율이 부족하다면 해결책(저판 폭 확장, 활동방지벽 추가 등) 구체적 제시
3. 건축주 브리핑용 3줄 요약: 전문 용어를 배제하고 현재 상황과 조치사항을 알기 쉽게 3줄로 요약

전문적이고 신뢰감 있는 어조로 작성해주세요.
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: "당신은 최고의 토목구조 설계 전문가입니다. 마크다운 형식을 사용하여 가독성 좋게 답변하세요." }] }
    };

    try {
      const data = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setAiReport(text);
      } else {
        throw new Error("응답을 파싱할 수 없습니다.");
      }
    } catch (e) {
      setAiError("AI 분석 중 통신 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // 간단한 마크다운 텍스트 포매터
  const formatText = (text) => {
    if (!text) return { __html: '' };
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-900 font-bold">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="text-indigo-800">$1</em>')
        .replace(/\n/g, '<br />');
    return { __html: formatted };
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-200">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white py-5 px-6 shadow-md sticky top-0 z-10">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-inner">
              <Calculator size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">L형 옹벽 구조계산 PRO ✨</h1>
              <p className="text-xs text-slate-400 font-medium tracking-wide">도로교설계기준 / 전면(1:0.02) 및 헌치 / 방음벽 하중 반영 / AI 검토</p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="text-xs bg-slate-700/50 border border-slate-600 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 실시간 연산 중
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6 flex flex-col gap-8 mt-4">
        
        {/* Upper Layout: Inputs & Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Inputs */}
          <section className="lg:col-span-4 space-y-6">
            <InputSection title="기하학적 치수 (m)" icon={<Ruler size={18} />} color="blue">
              <InputField label="전체 높이(H)" name="H" value={inputs.H} onChange={handleChange} />
              <InputField label="저판 폭(B)" name="B" value={inputs.B} onChange={handleChange} />
              <InputField label="상단 두께(t1)" name="t1" value={inputs.t1} onChange={handleChange} />
              <InputField label="하단 두께(t2)" name="t2" value={inputs.t2} onChange={handleChange} />
              <InputField label="저판 두께(D)" name="D" value={inputs.D} onChange={handleChange} />
              <InputField label="앞굽 폭(Bt)" name="Bt" value={inputs.Bt} onChange={handleChange} />
            </InputSection>

            <InputSection title="배면 헌치 (Haunch)" icon={<TriangleRight size={18} />} color="emerald">
              <div className="col-span-2 mb-2 flex items-center justify-between bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                <label className="text-sm font-bold text-emerald-900 cursor-pointer flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    name="useHaunch" 
                    checked={inputs.useHaunch} 
                    onChange={handleChange} 
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  배면 하단 헌치 적용
                </label>
              </div>
              {inputs.useHaunch && (
                <>
                  <InputField label="헌치 높이(Hh, m)" name="Hh" value={inputs.Hh} onChange={handleChange} />
                  <InputField label="헌치 폭(Bh, m)" name="Bh_haunch" value={inputs.Bh_haunch} onChange={handleChange} />
                </>
              )}
            </InputSection>

            <InputSection title="활동방지벽 (Shear Key)" icon={<Layers size={18} />} color="indigo">
              <div className="col-span-2 mb-2 flex items-center justify-between bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                <label className="text-sm font-bold text-indigo-900 cursor-pointer flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    name="useShearKey" 
                    checked={inputs.useShearKey} 
                    onChange={handleChange} 
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  활동방지벽 적용 (도로교설계기준)
                </label>
              </div>
              {inputs.useShearKey && (
                <>
                  <InputField label="깊이(Hk, m)" name="Hk" value={inputs.Hk} onChange={handleChange} />
                  <InputField label="두께(tk, m)" name="tk" value={inputs.tk} onChange={handleChange} />
                  <InputField label="앞굽에서의 거리(Xk, m)" name="Xk" value={inputs.Xk} onChange={handleChange} />
                </>
              )}
            </InputSection>

            <InputSection title="토사 및 재료 제원" icon={<Waves size={18} />} color="amber">
              <InputField label="마찰각(φ, °)" name="phi" value={inputs.phi} onChange={handleChange} />
              <InputField label="토사 단위중량(γs)" name="gammaS" value={inputs.gammaS} onChange={handleChange} />
              <InputField label="상재하중(q)" name="q_surcharge" value={inputs.q_surcharge} onChange={handleChange} />
              <InputField label="허용지지력(qa)" name="qa" value={inputs.qa} onChange={handleChange} />
              <InputField label="마찰계수(μ)" name="frictionCoeff" value={inputs.frictionCoeff} onChange={handleChange} />
              <InputField label="콘크리트 단위중량" name="gammaC" value={inputs.gammaC} onChange={handleChange} />
            </InputSection>

            <InputSection title="방음벽 및 풍하중" icon={<Wind size={18} />} color="slate">
              <InputField label="방음벽 하중(kN/m)" name="noiseBarrierWeight" value={inputs.noiseBarrierWeight} onChange={handleChange} />
              <InputField label="방음벽 높이(m)" name="noiseBarrierHeight" value={inputs.noiseBarrierHeight} onChange={handleChange} />
              <InputField label="설계 풍압(kN/m²)" name="windPressure" value={inputs.windPressure} onChange={handleChange} />
            </InputSection>
          </section>

          {/* Right Column: Visualization and Results */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Stability Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StabilityCard title="전도 안전율" value={results.FSo.toFixed(2)} limit="2.0" isOk={results.isFSoOk} />
              <StabilityCard title="활동 안전율" value={results.FSs.toFixed(2)} limit="1.5" isOk={results.isFSsOk} />
              <StabilityCard title="최대 지반압" value={results.q_max.toFixed(1)} limit={inputs.qa} isOk={results.isQaOk} unit="kN/m²" />
            </div>

            {/* SVG Diagram */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center relative flex-1 min-h-[400px]">
              <div className="absolute top-4 left-4 flex items-center gap-2 text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-100 shadow-sm z-10">
                <Settings2 size={14} className="text-indigo-500" /> 옹벽 단면도 (CAD 스케일 자동맞춤)
              </div>
              <div className="w-full h-full flex items-center justify-center pt-8">
                <WallDiagram inputs={inputs} />
              </div>
            </div>
          </section>
        </div>

        {/* Bottom Section: Detailed Calculations & AI */}
        <section className="flex flex-col gap-4 w-full">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 ml-1">
            <Info size={20} className="text-blue-500" /> 상세 연산 결과
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 전도 검토 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
              <h4 className="text-sm font-bold text-indigo-700 mb-4 pb-3 border-b border-indigo-100 flex items-center gap-2">
                <RotateCcw size={18} /> 1. 전도 검토 (Overturning)
              </h4>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <ResultRow label="저항모멘트 (ΣMr)" value={results.Mr_total.toFixed(2)} unit="kN·m/m" />
                  <ResultRow label="전도모멘트 (ΣMo)" value={results.Mo_total.toFixed(2)} unit="kN·m/m" />
                  <ResultRow label="전도 안전율 (Fs)" value={results.FSo.toFixed(2)} unit="" isOk={results.isFSoOk} highlight />
                  <ResultRow label="편심량 (e)" value={results.e.toFixed(4)} unit="m" />
                  <ResultRow label="편심 허용기준 (B/6)" value={results.B_6.toFixed(4)} unit="m" isOk={results.isEccOk} />
                </tbody>
              </table>
            </div>

            {/* 활동 검토 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
              <h4 className="text-sm font-bold text-amber-700 mb-4 pb-3 border-b border-amber-100 flex items-center gap-2">
                <MoveHorizontal size={18} /> 2. 활동 검토 (Sliding)
              </h4>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <ResultRow label="수평하중 합계 (ΣH)" value={results.H_total.toFixed(2)} unit="kN/m" />
                  <ResultRow label="마찰 저항력 (V×μ)" value={(results.V_total * inputs.frictionCoeff).toFixed(2)} unit="kN/m" />
                  {inputs.useShearKey && (
                    <ResultRow label="수동토압 저항 (Pp)" value={results.Pp.toFixed(2)} unit="kN/m" />
                  )}
                  <ResultRow label="총 수평저항력 (ΣR)" value={results.R_sliding.toFixed(2)} unit="kN/m" />
                  <ResultRow label="활동 안전율 (Fs)" value={results.FSs.toFixed(2)} unit="" isOk={results.isFSsOk} highlight />
                </tbody>
              </table>
            </div>

            {/* 지지력 검토 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
              <h4 className="text-sm font-bold text-emerald-700 mb-4 pb-3 border-b border-emerald-100 flex items-center gap-2">
                <ArrowDownToLine size={18} /> 3. 지지력 검토 (Bearing)
              </h4>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <ResultRow label="연직하중 합계 (ΣV)" value={results.V_total.toFixed(2)} unit="kN/m" />
                  <ResultRow label="편심량 (e)" value={results.e.toFixed(4)} unit="m" />
                  <ResultRow label="편심 허용치 (B/6)" value={results.B_6.toFixed(4)} unit="m" isOk={results.isEccOk} />
                  <ResultRow label="최대 지반압 (q_max)" value={results.q_max.toFixed(2)} unit="kN/m²" />
                  <ResultRow label="허용 지지력 (qa)" value={inputs.qa.toFixed(2)} unit="kN/m²" isOk={results.isQaOk} highlight />
                </tbody>
              </table>
            </div>
          </div>

          {/* AI 설계 자문 및 검토 (Gemini 연동) */}
          <div className="mt-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-white/60 p-4 border-b border-indigo-100 flex items-center justify-between">
              <h3 className="text-md font-bold text-indigo-900 flex items-center gap-2">
                <Bot className="text-purple-600" size={22} />
                ✨ AI 수석 엔지니어 설계 검토 <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full ml-2">Beta</span>
              </h3>
              <button 
                onClick={handleAiAnalysis}
                disabled={isAiLoading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isAiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isAiLoading ? 'AI가 분석 중입니다...' : '✨ AI 설계 자문 받기'}
              </button>
            </div>
            
            <div className="p-6">
              {!aiReport && !isAiLoading && !aiError && (
                <div className="text-center text-slate-400 text-sm py-8 flex flex-col items-center gap-3">
                  <Bot size={40} className="text-slate-300 opacity-50" />
                  <p>계산된 결과값을 기반으로 AI 수석 엔지니어의 최적화 제안과 평가를 받아보세요.</p>
                </div>
              )}
              
              {isAiLoading && (
                <div className="text-center py-10 flex flex-col items-center gap-4">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-indigo-600 text-sm font-medium animate-pulse">구조 데이터를 분석하고 대안을 검토 중입니다...</p>
                </div>
              )}
              
              {aiError && (
                <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm flex items-center gap-2">
                  <ShieldAlert size={18} /> {aiError}
                </div>
              )}

              {aiReport && !isAiLoading && (
                <div 
                  className="prose prose-sm max-w-none text-slate-700 leading-loose prose-strong:text-indigo-900"
                  dangerouslySetInnerHTML={formatText(aiReport)}
                />
              )}
            </div>
          </div>

          <div className="mt-2 p-5 bg-slate-50 rounded-2xl border border-slate-200 text-sm text-slate-500 leading-relaxed shadow-sm">
            <span className="font-bold text-slate-700 flex items-center gap-1.5 mb-2">
              <Info size={16} /> 기본 설계 참고사항
            </span>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="text-slate-600 font-medium">기하학적 치수 및 헌치:</span> 옹벽 전면부는 1:0.02의 경사로 자동 고정되며, 배면 경사는 벽체 상단/하단 두께에 따라 계산됩니다. 배면 하단 헌치 적용 시 하중 변화량이 실시간 반영됩니다.</li>
              <li><span className="text-slate-600 font-medium">검토원점:</span> 앞굽(Toe) 끝단 하부를 기준으로 모멘트를 산정하였습니다.</li>
              <li><span className="text-slate-600 font-medium">전도 편심검토:</span> 도로교설계기준에 따라 합력의 작용점이 저판 중앙 1/3 이내에 위치하는지 추가 확인합니다.</li>
              <li><span className="text-slate-600 font-medium">수동토압:</span> 활동방지벽 적용 시, 상부 저판 자중을 상재하중으로 환산하여 수동토압에 기여하도록 산정되었습니다.</li>
            </ul>
          </div>
        </section>

      </main>
    </div>
  );
};

// --- Sub Components ---

const InputSection = ({ title, icon, color, children }) => {
  const colorMap = {
    blue: 'text-blue-700 bg-blue-50/50 border-blue-100',
    indigo: 'text-indigo-700 bg-indigo-50/50 border-indigo-100',
    emerald: 'text-emerald-700 bg-emerald-50/50 border-emerald-100',
    amber: 'text-amber-700 bg-amber-50/50 border-amber-100',
    slate: 'text-slate-700 bg-slate-50/50 border-slate-200'
  };
  
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
      <h2 className={`flex items-center gap-2 text-sm font-bold mb-4 pb-3 border-b ${colorMap[color] || colorMap.slate} p-3 rounded-lg border`}>
        {icon} {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  );
};

const InputField = ({ label, name, value, onChange }) => (
  <div className="flex flex-col">
    <label className="text-[11px] font-bold text-slate-500 mb-1 tracking-tight">{label}</label>
    <input
      type="number"
      name={name}
      value={value}
      onChange={onChange}
      step="any"
      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-slate-50 hover:bg-white"
    />
  </div>
);

const StabilityCard = ({ title, value, limit, isOk, unit = "" }) => (
  <div className={`p-5 rounded-2xl border flex flex-col relative overflow-hidden transition-all duration-300 ${
    isOk ? 'bg-white border-emerald-200 shadow-sm' : 'bg-rose-50 border-rose-300 shadow-md ring-1 ring-rose-200'
  }`}>
    {isOk ? 
      <ShieldCheck size={80} className="absolute -right-4 -bottom-4 text-emerald-50 opacity-50" /> : 
      <ShieldAlert size={80} className="absolute -right-4 -bottom-4 text-rose-100 opacity-50" />
    }
    
    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 z-10">{title}</span>
    
    <div className="flex items-baseline gap-1 z-10">
      <span className={`text-3xl font-black tracking-tighter ${isOk ? 'text-slate-800' : 'text-rose-700'}`}>
        {value}
      </span>
      {unit && <span className="text-xs text-slate-500 font-medium">{unit}</span>}
    </div>
    
    <div className="mt-auto pt-4 flex items-center justify-between z-10">
      <span className="text-[11px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-md">기준: {limit}</span>
      {isOk ? (
        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md shadow-sm">OK</span>
      ) : (
        <span className="text-[11px] font-bold text-rose-700 bg-rose-200 px-2.5 py-1 rounded-md shadow-sm flex items-center gap-1">
          NG
        </span>
      )}
    </div>
  </div>
);

const ResultRow = ({ label, value, unit, isOk = null, highlight = false }) => (
  <tr className={`group transition-colors ${highlight ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
    <td className={`py-3 px-2 ${highlight ? 'text-indigo-700 font-semibold' : 'text-slate-600 font-medium'}`}>
      {label}
    </td>
    <td className="py-3 px-2 text-right font-mono font-semibold text-slate-800">
      {value} <span className="text-xs text-slate-400 font-normal font-sans ml-0.5">{unit}</span>
      {isOk !== null && (
        <span className={`ml-3 text-[10px] px-1.5 py-0.5 rounded shadow-sm ${isOk ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100'}`}>
          {isOk ? 'OK' : 'NG'}
        </span>
      )}
    </td>
  </tr>
);

// SVG 단면도 컴포넌트
const WallDiagram = ({ inputs }) => {
  const { H, B, Bt, t1, t2, D, noiseBarrierHeight, useShearKey, Hk, tk, Xk, useHaunch, Hh, Bh_haunch } = inputs;
  
  // 1미터 = 50 픽셀 비율 고정 적용 (동적 뷰박스 생성을 위함)
  const scale = 50;
  
  // 요소별 여백을 넉넉하게 산정
  const paddingLeft = 100;
  const paddingRight = 130;
  const paddingTop = 90;
  const paddingBottom = useShearKey ? 130 : 90;

  // 전체 SVG 크기 동적 산출 (빈 공간 제거)
  const svgWidth = paddingLeft + (B * scale) + paddingRight;
  const svgHeight = paddingTop + (noiseBarrierHeight * scale) + (H * scale) + (useShearKey ? Hk * scale : 0) + paddingBottom;

  // 주요 앵커 좌표
  const wall_top_y = paddingTop + noiseBarrierHeight * scale;
  const base_top_y = wall_top_y + (H - D) * scale;
  const base_bottom_y = wall_top_y + H * scale;
  
  const toe_x = paddingLeft;
  const heel_x = toe_x + B * scale;
  const soil_right_x = heel_x + 90; // 토사 그리기 우측 끝선
  
  // 전면 1:0.02 경사 및 배면 좌표 반영
  const dx_front = (H - D) * 0.02 * scale;
  const wall_bottom_left = toe_x + Bt * scale;
  const wall_bottom_right = wall_bottom_left + t2 * scale;
  const wall_top_left = wall_bottom_left + dx_front;
  const wall_top_right = wall_top_left + t1 * scale;

  // 배면 헌치 좌표 계산
  const haunch_h_px = useHaunch ? Hh * scale : 0;
  const haunch_w_px = useHaunch ? Bh_haunch * scale : 0;
  const back_face_dx = wall_bottom_right - wall_top_right;
  const x_haunch_top = useHaunch ? wall_bottom_right - back_face_dx * (Hh / (H - D)) : wall_bottom_right;
  const y_haunch_top = base_top_y - haunch_h_px;
  const x_haunch_bottom = wall_bottom_right + haunch_w_px;

  // 활동방지벽 좌표
  const key_left = toe_x + Xk * scale;
  const key_right = key_left + tk * scale;
  const key_bottom = base_bottom_y + (useShearKey ? Hk * scale : 0);

  // 옹벽 본체 Path 생성 (헌치 포함)
  let wallPath = `
    M ${toe_x} ${base_top_y} 
    L ${wall_bottom_left} ${base_top_y} 
    L ${wall_top_left} ${wall_top_y} 
    L ${wall_top_right} ${wall_top_y} 
    L ${x_haunch_top} ${y_haunch_top}
    L ${x_haunch_bottom} ${base_top_y} 
    L ${heel_x} ${base_top_y} 
    L ${heel_x} ${base_bottom_y} 
  `;

  if (useShearKey) {
    wallPath += `
      L ${key_right} ${base_bottom_y} 
      L ${key_right} ${key_bottom} 
      L ${key_left} ${key_bottom} 
      L ${key_left} ${base_bottom_y} 
    `;
  }

  wallPath += `L ${toe_x} ${base_bottom_y} Z`;

  // CAD 스타일 치수선 (수평)
  const DimH = ({ x1, x2, y, extY1, extY2, text, offsetTextY = -6 }) => (
    <g className="cad-dimension">
      <line x1={x1} y1={extY1} x2={x1} y2={y + 8} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
      <line x1={x2} y1={extY2} x2={x2} y2={y + 8} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#64748b" strokeWidth="1.2" />
      <line x1={x1 - 4} y1={y + 4} x2={x1 + 4} y2={y - 4} stroke="#475569" strokeWidth="1.5" />
      <line x1={x2 - 4} y1={y + 4} x2={x2 + 4} y2={y - 4} stroke="#475569" strokeWidth="1.5" />
      <text x={(x1 + x2) / 2} y={y + offsetTextY} fontSize="11" fill="#334155" textAnchor="middle" fontWeight="700" style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: '3px' }}>{text}</text>
    </g>
  );

  // CAD 스타일 치수선 (수직)
  const DimV = ({ x, y1, y2, extX1, extX2, text, isRightSide = false }) => {
    const extDir = isRightSide ? 8 : -8;
    const offsetTextX = isRightSide ? 14 : -6;
    
    return (
      <g className="cad-dimension">
        <line x1={extX1} y1={y1} x2={x + extDir} y2={y1} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
        <line x1={extX2} y1={y2} x2={x + extDir} y2={y2} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
        <line x1={x} y1={y1} x2={x} y2={y2} stroke="#64748b" strokeWidth="1.2" />
        <line x1={x - 4} y1={y1 + 4} x2={x + 4} y2={y1 - 4} stroke="#475569" strokeWidth="1.5" />
        <line x1={x - 4} y1={y2 + 4} x2={x + 4} y2={y2 - 4} stroke="#475569" strokeWidth="1.5" />
        <text x={x + offsetTextX} y={(y1 + y2) / 2} fontSize="11" fill="#334155" textAnchor="middle" transform={`rotate(-90, ${x + offsetTextX}, ${(y1 + y2) / 2})`} fontWeight="700" style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: '3px' }}>{text}</text>
      </g>
    );
  };

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="4" refY="4" orientation="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#0ea5e9" />
        </marker>
        <marker id="arrow-orange" markerWidth="6" markerHeight="6" refX="3" refY="3" orientation="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#d97706" />
        </marker>
        
        {/* 토사 패턴 */}
        <pattern id="soilPattern" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#fcd34d" strokeWidth="1" opacity="0.6"/>
          <circle cx="6" cy="6" r="1" fill="#f59e0b" opacity="0.4" />
        </pattern>

        <linearGradient id="concreteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>

        <filter id="wallShadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="3" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* 전면 지표면 라인 */}
      <line x1={toe_x - 60} y1={base_top_y} x2={toe_x} y2={base_top_y} stroke="#d97706" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />

      {/* 배면 토사 (Soil) */}
      <path d={`M ${wall_top_right} ${wall_top_y} L ${soil_right_x} ${wall_top_y} L ${soil_right_x} ${base_top_y} L ${x_haunch_bottom} ${base_top_y} L ${x_haunch_top} ${y_haunch_top} Z`} fill="#fef3c7" opacity="0.5" />
      <path d={`M ${wall_top_right} ${wall_top_y} L ${soil_right_x} ${wall_top_y} L ${soil_right_x} ${base_top_y} L ${x_haunch_bottom} ${base_top_y} L ${x_haunch_top} ${y_haunch_top} Z`} fill="url(#soilPattern)" />
      
      {/* 배면 지표면 상단 라인 */}
      <line x1={wall_top_right} y1={wall_top_y} x2={soil_right_x} y2={wall_top_y} stroke="#d97706" strokeWidth="2" opacity="0.8" />

      {/* 활동방지벽 수동토압 영역 */}
      {useShearKey && (
        <path d={`M ${key_right} ${base_bottom_y} L ${key_right + 50} ${base_bottom_y - 25} L ${key_right} ${key_bottom} Z`} fill="rgba(99, 102, 241, 0.1)" stroke="#6366f1" strokeDasharray="3" strokeWidth="1.5" />
      )}

      {/* 옹벽 본체 */}
      <path d={wallPath} fill="url(#concreteGrad)" stroke="#475569" strokeWidth="2" strokeLinejoin="round" filter="url(#wallShadow)" />

      {/* 방음벽 */}
      <rect 
        x={wall_top_left + (t1 * scale / 4)} 
        y={wall_top_y - noiseBarrierHeight * scale} 
        width={t1 * scale / 2} 
        height={noiseBarrierHeight * scale} 
        fill="rgba(56, 189, 248, 0.15)" 
        stroke="#0ea5e9" 
        strokeWidth="2" 
        rx="1"
      />

      {/* ------ CAD 스타일 상세 치수선 ------ */}
      
      {/* 수직 치수선 (좌측) */}
      <DimV x={toe_x - 40} y1={wall_top_y - noiseBarrierHeight * scale} y2={wall_top_y} extX1={wall_top_left + (t1 * scale / 4)} extX2={wall_top_left} text={`${noiseBarrierHeight}m`} />
      <DimV x={toe_x - 40} y1={wall_top_y} y2={base_top_y} extX1={wall_top_left} extX2={wall_bottom_left} text={`${(H - D).toFixed(2)}m`} />
      <DimV x={toe_x - 40} y1={base_top_y} y2={base_bottom_y} extX1={toe_x} extX2={toe_x} text={`${D.toFixed(2)}m`} />
      <DimV x={toe_x - 80} y1={wall_top_y} y2={base_bottom_y} extX1={toe_x - 40} extX2={toe_x - 40} text={`H = ${H.toFixed(2)}m`} />
      
      {/* 수평 치수선 (하단 - Level 1) */}
      <DimH x1={toe_x} x2={wall_bottom_left} y={base_bottom_y + 30} extY1={base_bottom_y} extY2={base_bottom_y} text={Bt} />
      <DimH x1={wall_bottom_left} x2={wall_bottom_right} y={base_bottom_y + 30} extY1={base_bottom_y} extY2={base_bottom_y} text={t2} />
      <DimH x1={wall_bottom_right} x2={heel_x} y={base_bottom_y + 30} extY1={base_bottom_y} extY2={base_bottom_y} text={(B - Bt - t2).toFixed(2)} />

      {/* 수평 및 수직 치수선 (활동방지벽) */}
      {useShearKey && (
        <>
          <DimH x1={toe_x} x2={key_left} y={key_bottom + 30} extY1={base_bottom_y} extY2={key_bottom} text={Xk} />
          <DimH x1={key_left} x2={key_right} y={key_bottom + 30} extY1={key_bottom} extY2={key_bottom} text={tk} />
          <DimV x={key_right + 25} y1={base_bottom_y} y2={key_bottom} extX1={key_right} extX2={key_right} text={Hk} isRightSide={true} />
        </>
      )}

      {/* 수평 치수선 (하단 - Level 2 전폭) */}
      <DimH x1={toe_x} x2={heel_x} y={base_bottom_y + (useShearKey ? Hk * scale + 65 : 65)} extY1={base_bottom_y + 40} extY2={base_bottom_y + 40} text={`B = ${B.toFixed(2)}m`} />

      {/* 수평 치수선 (상단) */}
      <DimH x1={wall_top_left} x2={wall_top_right} y={wall_top_y - 20} extY1={wall_top_y} extY2={wall_top_y} text={t1} />

      {/* 치수선 (배면 헌치) - 겹침 방지 */}
      {useHaunch && (
        <>
          {/* 폭 Bh (헌치 바로 위에 배치) */}
          <DimH x1={wall_bottom_right} x2={x_haunch_bottom} y={base_top_y - 15} extY1={base_top_y} extY2={base_top_y} text={Bh_haunch} offsetTextY={-4} />
          {/* 높이 Hh (헌치 우측에 배치) */}
          <DimV x={x_haunch_bottom + 20} y1={y_haunch_top} y2={base_top_y} extX1={x_haunch_top} extX2={x_haunch_bottom} text={Hh} isRightSide={true} />
        </>
      )}

      {/* 전면 기울기(1:0.02) 표시 기호 */}
      <g transform={`translate(${wall_top_left - 30}, ${wall_top_y + 40})`}>
        <polygon points="0,0 20,0 20,30" fill="none" stroke="#64748b" strokeWidth="1" />
        <text x="10" y="-5" fontSize="10" fill="#64748b" textAnchor="middle" fontWeight="bold">0.02</text>
        <text x="28" y="18" fontSize="10" fill="#64748b" textAnchor="middle" fontWeight="bold">1</text>
      </g>

      {/* 하중 화살표 (Loads) */}
      {/* 풍하중 */}
      <line x1={wall_top_left - 60} y1={wall_top_y - (noiseBarrierHeight*scale/2)} x2={wall_top_left - 10} y2={wall_top_y - (noiseBarrierHeight*scale/2)} stroke="#0ea5e9" strokeWidth="2.5" markerEnd="url(#arrow-blue)" />
      <text x={wall_top_left - 65} y={wall_top_y - (noiseBarrierHeight*scale/2) + 4} fontSize="12" fill="#0284c7" textAnchor="end" fontWeight="800" style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: '3px' }}>Wind</text>

      {/* 상재하중 (q) - 지표면 상단 토사 영역에 넓게 재하 */}
      <g>
        <rect x={wall_top_right} y={wall_top_y - 25} width={soil_right_x - wall_top_right - 20} height={25} fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" />
        <text x={(wall_top_right + soil_right_x - 20) / 2} y={wall_top_y - 32} fontSize="12" fill="#b45309" textAnchor="middle" fontWeight="800" style={{ paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: '3px' }}>Surcharge (q)</text>
        
        {/* 여러 개의 하중 재하 화살표 생성 */}
        {[...Array(Math.max(3, Math.floor((soil_right_x - wall_top_right - 20) / 30)))].map((_, i, arr) => {
          const spacing = (soil_right_x - wall_top_right - 20) / arr.length;
          const arrowX = wall_top_right + (spacing / 2) + (i * spacing);
          return (
            <path key={i} d={`M ${arrowX} ${wall_top_y - 20} L ${arrowX} ${wall_top_y - 2}`} stroke="#d97706" strokeWidth="1.5" markerEnd="url(#arrow-orange)" />
          );
        })}
      </g>
    </svg>
  );
}

export default App;

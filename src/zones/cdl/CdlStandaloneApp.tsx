import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Smartphone,
  Tablet,
  Award,
  BookOpen,
  RotateCcw,
  Sparkles,
  MapPin,
  ClipboardList,
  Home,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Volume2,
  VolumeX,
  Play,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Truck,
  Disc,
  Droplets,
  Container,
  Fuel,
  Bus,
  School,
  SlidersHorizontal,
  Workflow,
  Wrench,
  CircleDot,
  Link2
} from 'lucide-react'

// Import all question banks and data sets from local files
import {
  HAZMAT_QUESTIONS,
  AIR_BRAKES_QUESTIONS,
  TANKER_QUESTIONS,
  DOUBLES_TRIPLES_QUESTIONS,
  TANKER_DOUBLES_QUESTIONS,
  TANKER_HAZMAT_QUESTIONS,
  PASSENGER_QUESTIONS,
  SCHOOL_BUS_QUESTIONS,
  PRETRIP_CABIN_QUESTIONS,
  PRETRIP_ENGINE_BAY_QUESTIONS,
  PRETRIP_STEERING_AXLE_QUESTIONS,
  PRETRIP_COUPLING_QUESTIONS,
  PRETRIP_TRAILER_QUESTIONS,
  ANSWER_LABELS,
  type CdlQuestion
} from './cdl-questions'

import {
  DEEP_DIVE_SECTIONS,
  type DeepDiveItem
} from './cdl-pretrip-deep-data'

import {
  PRETRIP_INSPECTION_SECTIONS,
  type PartHotspot
} from './cdl-pretrip-parts-map-data'

/* ── REAL-TIME SOUND EFFECT SYNTHESIZER ── */
function playSynthSound(type: 'correct' | 'wrong' | 'click') {
  if (typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextClass) return
  try {
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'correct') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08) // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16) // G5
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } else if (type === 'wrong') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, ctx.currentTime) // Gb3
      osc.frequency.setValueAtTime(130.81, ctx.currentTime + 0.12) // C3
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
      osc.start()
      osc.stop(ctx.currentTime + 0.4)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, ctx.currentTime)
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)
      osc.start()
      osc.stop(ctx.currentTime + 0.08)
    }
  } catch (e) {
    // Blocked by browser autoplay constraints or disabled audio
  }
}

/* ── TEXT-TO-SPEECH AUDIO SYNTHESIZER ── */
function speakText(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  u.pitch = 1.0
  if (onEnd) {
    u.onend = onEnd
  }
  window.speechSynthesis.speak(u)
}

function stopSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

/* ── MOCK SYSTEM PRESETS ── */
const PALETTE = {
  bg: '#04070a',
  card: '#0a0f14',
  text: '#d1ebf7',
  textDim: '#4e7385',
  accent: '#22d3ee', // Cyber Cyan
  accentSoft: 'rgba(34, 211, 238, 0.08)',
  accentMedium: 'rgba(34, 211, 238, 0.2)',
  good: '#10b981', // Emerald
  bad: '#ef4444', // Red
  border: '#13212c',
  glow: 'rgba(34, 211, 238, 0.15)',
  yellow: '#f5c429',
  purple: '#a855f7',
} as const

interface QuizMeta {
  id: string
  label: string
  desc: string
  officialCount: number
  endorse: string
  accent: string
  icon: any
  questions: CdlQuestion[]
}

const QUIZZES: QuizMeta[] = [
  { id: 'hazmat', label: 'Hazmat (H)', desc: 'Hazardous Materials endorsement — placarding, shipping papers, emergency drills. 30 questions.', officialCount: 30, endorse: 'H', accent: PALETTE.good, icon: Award, questions: HAZMAT_QUESTIONS },
  { id: 'air-brakes', label: 'Air Brakes', desc: 'Core CDL knowledge — service, parking, and emergency air chambers, warnings, tug tests. 25 questions.', officialCount: 25, endorse: 'CORE', accent: PALETTE.yellow, icon: Disc, questions: AIR_BRAKES_QUESTIONS },
  { id: 'tanker', label: 'Tanker (N)', desc: 'Liquid surge, outages, baffled vs smooth-bore roll stability. 20 questions.', officialCount: 20, endorse: 'N', accent: '#00b8d4', icon: Droplets, questions: TANKER_QUESTIONS },
  { id: 'doubles-triples', label: 'Doubles / Triples (T)', desc: 'Converter dollies, coupling sequence, off-tracking, crack-the-whip amplification. 20 questions.', officialCount: 20, endorse: 'T', accent: '#ff7b29', icon: Container, questions: DOUBLES_TRIPLES_QUESTIONS },
  { id: 'tanker-hazmat', label: 'Tanker + HazMat (X)', desc: 'Combined endorsement prep. Fuel transport specs, grounding, vapor control. 50 questions.', officialCount: 50, endorse: 'X', accent: '#ef4444', icon: Fuel, questions: TANKER_HAZMAT_QUESTIONS },
  { id: 'passenger', label: 'Passenger (P)', desc: '16+ passenger vehicle requirements — RR crossings, fueling safety, emergency checks. 20 questions.', officialCount: 20, endorse: 'P', accent: '#3b82f6', icon: Bus, questions: PASSENGER_QUESTIONS },
  { id: 'school-bus', label: 'School Bus (S)', desc: 'Crossing danger zones, RR crossing drills, mirrored blindspots, emergency evacuations. 20 questions.', officialCount: 20, endorse: 'S', accent: '#facc15', icon: School, questions: SCHOOL_BUS_QUESTIONS },
  { id: 'tanker-doubles', label: 'Tanker Doubles / Triples', desc: 'Double-tanker physics, vapor transfer, off-tracking, compound surge stability. 40 questions.', officialCount: 40, endorse: 'N+T', accent: PALETTE.purple, icon: Workflow, questions: TANKER_DOUBLES_QUESTIONS },
]

const PRETRIP_QUIZZES: QuizMeta[] = [
  { id: 'pt-cabin', label: 'In-Cabin Inspection', desc: 'Step 1 of 5 — Safety start, air brake leak checks (auto-fail items), dash gauges, tug tests. 59 questions.', officialCount: 59, endorse: 'STEP 1', accent: '#5b9dff', icon: ClipboardList, questions: PRETRIP_CABIN_QUESTIONS },
  { id: 'pt-engine', label: 'Engine Bay Area', desc: 'Step 2 of 5 — Fluid levels, alternator belt play, steering shaft linkages, water pump. 30 questions.', officialCount: 30, endorse: 'STEP 2', accent: '#22d3ee', icon: Wrench, questions: PRETRIP_ENGINE_BAY_QUESTIONS },
  { id: 'pt-steering', label: 'Steering Axle & Side', desc: 'Step 3 of 5 — Sidewall check, lug nut trails, brake contamination, Def tank, battery box. 37 questions.', officialCount: 37, endorse: 'STEP 3', accent: '#2dd4bf', icon: CircleDot, questions: PRETRIP_STEERING_AXLE_QUESTIONS },
  { id: 'pt-coupling', label: 'Coupling System', desc: 'Step 4 of 5 — Glad hands, 7-pin cord, kingpin jaws, apron contact, release handle. 25 questions.', officialCount: 25, endorse: 'STEP 4', accent: '#a3e635', icon: Link2, questions: PRETRIP_COUPLING_QUESTIONS },
  { id: 'pt-trailer', label: 'Trailer & Rear Check', desc: 'Step 5 of 5 — Landing gear cranks, reflective tape, rear corner lenses, indicator tests. 20 questions.', officialCount: 20, endorse: 'STEP 5', accent: '#fbbf24', icon: Truck, questions: PRETRIP_TRAILER_QUESTIONS }
]

function shuffleAndTake(arr: any[], count: number) {
  const c = arr.slice()
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = c[i]
    c[i] = c[j]
    c[j] = tmp
  }
  return c.slice(0, count)
}

export default function CdlStandaloneApp() {
  const [deviceMode, setDeviceMode] = useState<'ios' | 'android' | 'fullscreen'>('ios')
  const [appState, setAppState] = useState<'welcome' | 'dashboard'>('welcome')
  const [activeTab, setActiveTab] = useState<'home' | 'endorsements' | 'pretrip' | 'partsmap' | 'deepdive' | 'stats'>('home')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  // Screen level states (if not in tabs, we are in a quiz or study sheet)
  const [activeQuiz, setActiveQuiz] = useState<QuizMeta | null>(null)
  const [quizQuestions, setQuizQuestions] = useState<CdlQuestion[]>([])
  const [extendedQuiz, setExtendedQuiz] = useState(false)
  const [quizIndex, setQuizIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({})
  const [quizConfirmed, setQuizConfirmed] = useState(false)
  const [quizStage, setQuizStage] = useState<'intro' | 'active' | 'results' | 'review'>('intro')
  const [reviewIndex, setReviewIndex] = useState(0)

  // TTS audio toggle
  const [speechEnabled, setSpeechEnabled] = useState(true)

  // Interactive Parts Map States
  const [mapSectionIdx, setMapSectionIdx] = useState(0)
  const [mapSelectedNum, setMapSelectedNum] = useState<number | null>(null)
  const [mapVisited, setMapVisited] = useState<Record<string, number[]>>(() => {
    try {
      const saved = localStorage.getItem('cdl_map_visited')
      return saved ? JSON.parse(saved) : {}
    } catch (e) {
      return {}
    }
  })

  // Deep Dive Flashcard States
  const [deepSectionIdx, setDeepSectionIdx] = useState(0)
  const [deepCardIdx, setDeepCardIdx] = useState(0)
  const [deepVisited, setDeepVisited] = useState<Record<string, number[]>>(() => {
    try {
      const saved = localStorage.getItem('cdl_deep_visited')
      return saved ? JSON.parse(saved) : {}
    } catch (e) {
      return {}
    }
  })
  const [speakingDeep, setSpeakingDeep] = useState(false)

  // Progress metrics state
  const [completedTests, setCompletedTests] = useState<{ id: string, score: number, total: number, passed: boolean }[]>(() => {
    try {
      const saved = localStorage.getItem('cdl_completed_tests')
      return saved ? JSON.parse(saved) : []
    } catch (e) {
      return []
    }
  })

  // Home Screen catalog tab filter state
  const [catalogTab, setCatalogTab] = useState<'endorsements' | 'pretrip'>('endorsements')

  /* ── DESKTOP MOUSE CLICK-AND-DRAG SCROLL SIMULATOR ── */
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const scrollTop = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.tagName === 'BUTTON' || 
      target.tagName === 'INPUT' || 
      target.tagName === 'circle' || 
      target.tagName === 'path' || 
      target.tagName === 'svg' || 
      target.tagName === 'text' || 
      target.closest('button') || 
      target.closest('input') ||
      target.closest('g') ||
      target.closest('.parts-hotspot')
    ) {
      return
    }
    isDragging.current = true
    startY.current = e.clientY
    scrollTop.current = scrollRef.current?.scrollTop || 0
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grabbing'
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return
    e.preventDefault()
    const deltaY = e.clientY - startY.current
    scrollRef.current.scrollTop = scrollTop.current - deltaY * 1.5
  }

  const handleMouseUpOrLeave = () => {
    isDragging.current = false
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'default'
    }
  }

  /* ── AUDIO TTS TRIGGER ON HOTSPOT CLICK ── */
  useEffect(() => {
    if (activeTab === 'partsmap' && mapSelectedNum !== null && speechEnabled) {
      const section = PRETRIP_INSPECTION_SECTIONS[mapSectionIdx]
      const spot = section?.hotspots.find(h => h.number === mapSelectedNum)
      if (spot) {
        speakText(spot.sayIt)
      }
    }
    return () => stopSpeech()
  }, [mapSelectedNum, mapSectionIdx, activeTab, speechEnabled])

  /* ── AUDIO TTS TRIGGER FOR FLASHCARD SWIPE ── */
  useEffect(() => {
    if (activeTab === 'deepdive' && speechEnabled) {
      const item = DEEP_DIVE_SECTIONS[deepSectionIdx]?.items[deepCardIdx]
      if (item) {
        setSpeakingDeep(true)
        speakText(item.sayIt, () => setSpeakingDeep(false))
      }
    }
    return () => {
      stopSpeech()
      setSpeakingDeep(false)
    }
  }, [deepCardIdx, deepSectionIdx, activeTab, speechEnabled])

  // Track resizing to automatically switch to fullscreen on mobile devices
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setDeviceMode('fullscreen')
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  /* ── SHUT DOWN SPEECH ON UNMOUNT ── */
  useEffect(() => {
    return () => {
      stopSpeech()
    }
  }, [])

  // Save progress metrics and visual history to localStorage on updates
  useEffect(() => {
    try {
      localStorage.setItem('cdl_completed_tests', JSON.stringify(completedTests))
    } catch (e) {
      // Ignored
    }
  }, [completedTests])

  useEffect(() => {
    try {
      localStorage.setItem('cdl_map_visited', JSON.stringify(mapVisited))
    } catch (e) {
      // Ignored
    }
  }, [mapVisited])

  useEffect(() => {
    try {
      localStorage.setItem('cdl_deep_visited', JSON.stringify(deepVisited))
    } catch (e) {
      // Ignored
    }
  }, [deepVisited])

  // Welcome Screen trigger
  const handleStartApp = () => {
    playSynthSound('click')
    setAppState('dashboard')
  }

  // Quiz launch
  const handleLaunchQuiz = (quiz: QuizMeta) => {
    playSynthSound('click')
    setActiveQuiz(quiz)
    setExtendedQuiz(false)
    setQuizStage('intro')
  }

  const handleStartQuizRun = () => {
    if (!activeQuiz) return
    playSynthSound('click')
    const count = extendedQuiz ? activeQuiz.questions.length : activeQuiz.officialCount
    const selected = activeQuiz.id.startsWith('pt-') 
      ? [...activeQuiz.questions].sort((a,b) => a.id - b.id) // Sequential Pre-Trip
      : shuffleAndTake(activeQuiz.questions, count)
    setQuizQuestions(selected)
    setUserAnswers({})
    setQuizIndex(0)
    setQuizConfirmed(false)
    setQuizStage('active')
  }

  const handleConfirmAnswer = (answerIdx: number) => {
    if (quizConfirmed) return
    const q = quizQuestions[quizIndex]
    if (!q) return
    
    const isCorrect = answerIdx === q.ans
    setUserAnswers(prev => ({ ...prev, [q.id]: answerIdx }))
    setQuizConfirmed(true)
    playSynthSound(isCorrect ? 'correct' : 'wrong')
  }

  const handleNextQuestion = () => {
    playSynthSound('click')
    if (quizIndex < quizQuestions.length - 1) {
      setQuizIndex(prev => prev + 1)
      setQuizConfirmed(false)
    } else {
      // Calculate results
      let score = 0
      let autoFailed = false
      quizQuestions.forEach(q => {
        const uAns = userAnswers[q.id]
        const correct = uAns === q.ans
        if (correct) score++
        if (q.autoFail && !correct) {
          autoFailed = true
        }
      })
      const passRatio = score / quizQuestions.length
      const passed = passRatio >= 0.8 && !autoFailed

      const res = { id: activeQuiz!.id, score, total: quizQuestions.length, passed }
      setCompletedTests(prev => {
        const filtered = prev.filter(p => p.id !== activeQuiz!.id)
        return [...filtered, res]
      })

      setQuizStage('results')
    }
  }

  const missedQuestions = useMemo(() => {
    return quizQuestions.filter(q => userAnswers[q.id] !== q.ans)
  }, [quizQuestions, userAnswers])

  const totalScorePercentage = useMemo(() => {
    if (completedTests.length === 0) return 0
    const passes = completedTests.filter(t => t.passed).length
    return Math.round((passes / completedTests.length) * 100)
  }, [completedTests])

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-4" style={{ background: '#020305', fontFamily: 'Courier New, monospace' }}>
      
      {/* ── TOP PREVIEW SELECTORS (DESKTOP INTERFACE) ── */}
      <div className="mb-4 hidden md:flex items-center justify-between w-full max-w-5xl bg-[#090f14] border border-[#13212c] rounded-xl px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#22d3ee]" />
          <span className="font-semibold text-[#d1ebf7]">CDL PRACTICE PREVIEW SUITE (MOBILE SIMULATOR)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#4e7385] mr-2">DEVICE MODE:</span>
          {(['ios', 'android', 'fullscreen'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => { playSynthSound('click'); setDeviceMode(mode) }}
              className="px-3 py-1 rounded font-bold uppercase transition-colors"
              style={{
                background: deviceMode === mode ? '#22d3ee' : 'transparent',
                color: deviceMode === mode ? '#000' : '#4e7385',
                border: deviceMode === mode ? 'none' : '1px solid #13212c'
              }}
            >
              {mode === 'ios' && <Smartphone className="inline size-3.5 mr-1 align-text-bottom" />}
              {mode === 'android' && <Tablet className="inline size-3.5 mr-1 align-text-bottom" />}
              {mode === 'fullscreen' && <span className="inline size-3.5 mr-1 font-bold">[]</span>}
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ── DEVICE SIMULATOR CONTAINER ── */}
      <div 
        className={`relative transition-all duration-300 ${
          deviceMode === 'fullscreen' 
            ? 'w-full max-w-full h-[90vh] md:h-[92vh] rounded-none' 
            : deviceMode === 'ios'
              ? 'w-[400px] h-[820px] rounded-[50px] border-[12px] border-[#222] shadow-[0_0_80px_rgba(34,211,238,0.15)] ring-4 ring-[#333]'
              : 'w-[420px] h-[800px] rounded-[36px] border-[16px] border-[#1c1c1c] shadow-[0_0_80px_rgba(34,211,238,0.15)] ring-4 ring-[#222]'
        } bg-[#04070a] overflow-hidden flex flex-col`}
      >
        {/* iOS / Android Device Bezel Details */}
        {deviceMode === 'ios' && (
          <div className="absolute top-0 inset-x-0 h-8 bg-black z-40 flex items-center justify-between px-8 text-[11px] text-white/90">
            <span className="font-semibold">9:41</span>
            <div className="w-28 h-[18px] bg-black rounded-b-2xl absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center">
              <div className="w-12 h-1.5 bg-[#333] rounded-full mb-1"></div>
            </div>
            <div className="flex items-center gap-1.5">
              <span>5G</span>
              <div className="w-[18px] h-2.5 border border-white/60 rounded-sm p-0.5 flex items-center">
                <div className="w-full h-full bg-white rounded-2xs"></div>
              </div>
            </div>
          </div>
        )}

        {deviceMode === 'android' && (
          <div className="absolute top-0 inset-x-0 h-6 bg-[#1a1a1a] z-40 flex items-center justify-between px-6 text-[10px] text-white/80">
            <span>LTE</span>
            <div className="flex items-center gap-2">
              <span>9:41 AM</span>
              <div className="w-3.5 h-3 bg-white/60 relative">
                <div className="absolute inset-0 border border-white/80"></div>
                <div className="absolute inset-x-0 bottom-0 bg-white" style={{ height: '70%' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* ── APP VIEWS INTERFACE ── */}
        <div className={`flex-1 flex flex-col ${deviceMode !== 'fullscreen' ? 'pt-8' : ''} text-[#d1ebf7] select-none`}>
          
          {/* ────────────────── WELCOME ANIMATION VIEW ────────────────── */}
          {appState === 'welcome' && (
            <div className="flex-1 flex flex-col justify-between p-6 relative bg-[#04070a] z-50">
              
              {/* Skip option */}
              <button 
                onClick={handleStartApp}
                className="absolute top-6 right-6 text-xs text-[#4e7385] hover:text-[#22d3ee] flex items-center gap-1 tracking-wider uppercase"
              >
                Skip <ArrowRight className="size-3" />
              </button>

              {/* Top Branding */}
              <div className="text-center mt-12">
                <div className="inline-block bg-[#22d3ee] text-black text-[10px] font-extrabold px-3 py-1 rounded uppercase tracking-[0.25em] mb-4">
                  CDL PRAC MOBILE
                </div>
                <h1 className="text-2xl font-black text-[#d1ebf7] tracking-wider uppercase mb-2">
                  TRUCK DRIVER PREP
                </h1>
                <p className="text-[#4e7385] text-[11px] uppercase tracking-widest max-w-[280px] mx-auto leading-relaxed">
                  High-Fidelity Road Skills & Endorsement Drills
                </p>
              </div>

              {/* 🚚 SEMI-TRUCK HIGHWAY DRIVING ANIMATION 🚚 */}
              <div className="w-full h-32 relative overflow-hidden flex flex-col justify-end mb-12">
                
                {/* Rolling Highway Roadbed */}
                <div className="w-full h-8 bg-[#0a1118] border-y border-[#182a39] relative flex items-center overflow-hidden">
                  
                  {/* Road Dashes (Infinitely sliding) */}
                  <div className="flex gap-12 shrink-0 animate-[roadRoll_1.8s_linear_infinite] w-[200%]">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-0.5 w-10 bg-[#facc15] opacity-80 shrink-0"></div>
                    ))}
                  </div>
                </div>

                {/* Cyber Semi-Truck Driving (SVG/HTML Hybrid) */}
                <div className="absolute bottom-[6px] left-[-90px] w-24 h-12 animate-[truckDrive_4.5s_ease-out_forwards] flex items-end">
                  
                  {/* Truck Body Vector */}
                  <svg className="w-full h-full" viewBox="0 0 100 50">
                    {/* Headlight glow */}
                    <polygon points="76,32 100,20 100,42" fill="rgba(34, 211, 238, 0.25)" />
                    
                    {/* Trailer (Steel Gray) */}
                    <rect x="2" y="5" width="55" height="30" fill="#2d3b45" stroke="#13212c" strokeWidth="1" rx="1" />
                    {/* Reflective Tape */}
                    <rect x="2" y="32" width="55" height="1.5" fill="#ef4444" />
                    <rect x="3" y="32" width="53" height="1.5" fill="#fff" strokeDasharray="3 3" />
                    
                    {/* Cab (Cyan Accent) */}
                    <polygon points="57,15 72,15 76,28 76,36 57,36" fill="#182a39" stroke="#22d3ee" strokeWidth="1" />
                    <rect x="58" y="28" width="18" height="8" fill="#182a39" stroke="#22d3ee" strokeWidth="1" />
                    {/* Windshield */}
                    <polygon points="68,17 72,17 74,27 68,27" fill="#22d3ee" opacity="0.8" />
                    
                    {/* Exhaust Stack */}
                    <rect x="58" y="0" width="2" height="15" fill="#4e7385" />
                    {/* Smoke puffs */}
                    <circle cx="59" cy="-2" r="2" fill="#22d3ee" opacity="0.3" className="animate-ping" />

                    {/* Wheels */}
                    <circle cx="12" cy="40" r="5" fill="#000" stroke="#4e7385" strokeWidth="1" />
                    <circle cx="12" cy="40" r="2.2" fill="#4e7385" />
                    <circle cx="22" cy="40" r="5" fill="#000" stroke="#4e7385" strokeWidth="1" />
                    <circle cx="22" cy="40" r="2.2" fill="#4e7385" />
                    
                    <circle cx="48" cy="40" r="5" fill="#000" stroke="#4e7385" strokeWidth="1" />
                    <circle cx="48" cy="40" r="2.2" fill="#4e7385" />
                    
                    <circle cx="70" cy="40" r="5" fill="#000" stroke="#4e7385" strokeWidth="1" />
                    <circle cx="70" cy="40" r="2.2" fill="#4e7385" />
                  </svg>
                </div>
              </div>

              {/* Action Button & Disclaimer */}
              <div className="text-center pb-8 flex flex-col items-center gap-4">
                <button
                  onClick={handleStartApp}
                  className="w-full max-w-[280px] bg-[#22d3ee] text-black font-extrabold py-4 px-6 rounded-lg text-sm tracking-[0.25em] shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:shadow-[0_0_40px_rgba(34,211,238,0.45)] transition-all animate-[pulse_2s_infinite]"
                >
                  START PREP
                </button>
                <span className="text-[#4e7385] text-[9px] uppercase tracking-wider">
                  NJ MVC Modernized Standards
                </span>
              </div>
            </div>
          )}

          {/* ────────────────── MAIN DASHBOARD & TAB PLATFORM ────────────────── */}
          {appState === 'dashboard' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#04070a]">
              
              {/* ── DYNAMIC HEADER BAR ── */}
              <header className="px-3.5 py-2.5 border-b border-[#13212c] bg-[#0a0f14] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  {/* Sidebar Toggle Button tucked into top left corner */}
                  <button
                    onClick={() => { playSynthSound('click'); setSidebarExpanded(!sidebarExpanded) }}
                    className="p-1.5 rounded border border-[#13212c] bg-[#070b0f] text-[#4e7385] hover:text-[#22d3ee] transition-all flex items-center justify-center cursor-pointer shrink-0"
                    title={sidebarExpanded ? "Hide Navigation Panel" : "Show Navigation Panel"}
                  >
                    <SlidersHorizontal className={`size-3.5 transition-transform ${sidebarExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Truck className="size-4.5 text-[#22d3ee] shrink-0" />
                    <span className="font-extrabold text-[11px] tracking-[0.15em] text-[#d1ebf7] truncate">CDL MOBILE</span>
                  </div>
                </div>
                
                {/* Audio speaker toggle */}
                <button 
                  onClick={() => { playSynthSound('click'); setSpeechEnabled(!speechEnabled) }}
                  className="p-1 rounded text-[#4e7385] hover:text-[#22d3ee] transition-colors"
                  title={speechEnabled ? "Disable Text-To-Speech Audio" : "Enable Text-To-Speech Audio"}
                >
                  {speechEnabled ? <Volume2 className="size-4 text-[#22d3ee]" /> : <VolumeX className="size-4" />}
                </button>
              </header>

              {/* ── CORE WRAPPER: TAB MENU ON LEFT ── */}
              <div className="flex-1 flex overflow-hidden">
                
                {/* LEFT TABS SIDEBAR (SIMPLE NAV SYSTEM) */}
                <nav 
                  className={`transition-all duration-300 ${
                    sidebarExpanded ? 'w-[56px] px-1 border-r border-[#13212c]' : 'w-0 overflow-hidden border-r-0'
                  } shrink-0 bg-[#070b0f] flex flex-col py-3 gap-4 items-center`}
                >
                  
                  {/* Home tab */}
                  <TabButton
                    active={activeTab === 'home'}
                    icon={Home}
                    label="HOME"
                    onClick={() => { playSynthSound('click'); setActiveTab('home'); setActiveQuiz(null); }}
                  />

                  {/* Endorsements tab */}
                  <TabButton
                    active={activeTab === 'endorsements'}
                    icon={Award}
                    label="MVC EXAMS"
                    onClick={() => { playSynthSound('click'); setActiveTab('endorsements'); setActiveQuiz(null); }}
                  />

                  {/* Pre-Trip quizzes tab */}
                  <TabButton
                    active={activeTab === 'pretrip'}
                    icon={Wrench}
                    label="PRE-TRIP"
                    onClick={() => { playSynthSound('click'); setActiveTab('pretrip'); setActiveQuiz(null); }}
                  />

                  {/* Visual parts map tab */}
                  <TabButton
                    active={activeTab === 'partsmap'}
                    icon={MapPin}
                    label="PARTS MAP"
                    onClick={() => { playSynthSound('click'); setActiveTab('partsmap'); setActiveQuiz(null); }}
                  />

                  {/* Deep dive flashcard tab */}
                  <TabButton
                    active={activeTab === 'deepdive'}
                    icon={ClipboardList}
                    label="DEEP DIVE"
                    onClick={() => { playSynthSound('click'); setActiveTab('deepdive'); setActiveQuiz(null); }}
                  />

                  {/* Metrics tab */}
                  <TabButton
                    active={activeTab === 'stats'}
                    icon={Activity}
                    label="METRICS"
                    onClick={() => { playSynthSound('click'); setActiveTab('stats'); setActiveQuiz(null); }}
                  />
                </nav>

                {/* ── TAB ACTIVE CONTENT CONTAINER ── */}
                <div 
                  ref={scrollRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUpOrLeave}
                  onMouseLeave={handleMouseUpOrLeave}
                  className="flex-1 overflow-y-auto flex flex-col relative"
                >

                  {/* ACTIVE SCREEN OVERRIDES (IF AN ACTIVE QUIZ IS LAUNCHED) */}
                  {activeQuiz !== null ? (
                    <div className="absolute inset-0 bg-[#04070a] z-30 flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                      
                      {/* Sub-Header bar inside quiz */}
                      <div className="px-4 py-3 bg-[#0a0f14] border-b border-[#13212c] flex items-center justify-between shrink-0">
                        <button
                          onClick={() => { playSynthSound('click'); stopSpeech(); setActiveQuiz(null); }}
                          className="text-[#4e7385] hover:text-[#22d3ee] flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase"
                        >
                          <ChevronLeft className="size-4" /> Exit
                        </button>
                        <span className="text-[10px] font-bold text-[#4e7385] tracking-[0.1em] truncate max-w-[180px]">
                          {activeQuiz.label.toUpperCase()}
                        </span>
                        <div className="w-10"></div> {/* spacer */}
                      </div>

                      {/* Quiz Stage Router */}
                      <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
                        
                        {/* 1. QUIZ INTRO STAGE */}
                        {quizStage === 'intro' && (
                          <div className="flex-1 flex flex-col justify-between">
                            <div className="text-center mt-6">
                              <span 
                                className="inline-block rounded px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest mb-3 border"
                                style={{ borderColor: activeQuiz.accent, color: activeQuiz.accent }}
                              >
                                {activeQuiz.endorse}
                              </span>
                              <h2 className="text-[20px] font-black tracking-wide text-zinc-100 uppercase mb-4 leading-tight">
                                {activeQuiz.label}
                              </h2>
                              <p className="text-[12px] text-[#4e7385] leading-relaxed max-w-[280px] mx-auto mb-8">
                                {activeQuiz.desc}
                              </p>

                              {/* Stat grid */}
                              <div className="grid grid-cols-2 gap-2 border border-[#13212c] rounded-xl bg-[#0a0f14] p-3 max-w-[300px] mx-auto text-center mb-6">
                                <div>
                                  <div className="text-[#22d3ee] font-black text-lg">{extendedQuiz ? activeQuiz.questions.length : activeQuiz.officialCount}</div>
                                  <div className="text-[#4e7385] text-[9px] uppercase tracking-wider mt-1">Questions</div>
                                </div>
                                <div>
                                  <div className="text-emerald-400 font-black text-lg">80%</div>
                                  <div className="text-[#4e7385] text-[9px] uppercase tracking-wider mt-1">To Pass</div>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 pb-6 max-w-[300px] mx-auto w-full">
                              
                              {/* Extended practice toggle (only for endorsement tests) */}
                              {!activeQuiz.id.startsWith('pt-') && activeQuiz.questions.length > activeQuiz.officialCount && (
                                <button
                                  onClick={() => { playSynthSound('click'); setExtendedQuiz(!extendedQuiz) }}
                                  className="py-2.5 px-4 rounded border text-[11px] font-bold tracking-wider uppercase text-left flex items-center justify-between"
                                  style={{
                                    borderColor: extendedQuiz ? '#22d3ee' : '#13212c',
                                    background: extendedQuiz ? 'rgba(34, 211, 238, 0.05)' : 'transparent',
                                    color: extendedQuiz ? '#22d3ee' : '#4e7385'
                                  }}
                                >
                                  <span>Extended (All {activeQuiz.questions.length} items)</span>
                                  <div className="w-3.5 h-3.5 border rounded-sm flex items-center justify-center" style={{ borderColor: extendedQuiz ? '#22d3ee' : '#4e7385' }}>
                                    {extendedQuiz && <div className="w-2 h-2 bg-[#22d3ee] rounded-3xs"></div>}
                                  </div>
                                </button>
                              )}

                              <button
                                onClick={handleStartQuizRun}
                                className="py-4 px-6 rounded-lg text-black font-extrabold text-xs tracking-[0.2em] shadow-lg text-center"
                                style={{ background: activeQuiz.accent }}
                              >
                                START PRACTICE
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 2. QUIZ ACTIVE RUN STAGE */}
                        {quizStage === 'active' && (() => {
                          const q = quizQuestions[quizIndex]
                          if (!q) return null
                          const progress = (quizIndex / quizQuestions.length) * 100
                          const currentAnswer = userAnswers[q.id]
                          const runningScore = Object.entries(userAnswers).filter(([id, ans]) => {
                            const relatedQ = quizQuestions.find(qq => qq.id === Number(id))
                            return relatedQ && ans === relatedQ.ans
                          }).length

                          return (
                            <div className="flex-1 flex flex-col justify-between">
                              
                              {/* Quiz progress indicator */}
                              <div className="shrink-0 mb-4">
                                <div className="flex items-center justify-between text-[11px] text-[#4e7385] font-bold tracking-wider uppercase mb-1">
                                  <span>Q {quizIndex + 1} / {quizQuestions.length}</span>
                                  <span className="text-[#22d3ee]">SCORE: {runningScore}</span>
                                </div>
                                <div className="h-1 bg-[#13212c] rounded-full overflow-hidden">
                                  <div className="h-full bg-[#22d3ee] transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                </div>
                              </div>

                              {/* Question Block */}
                              <div className="flex-1 flex flex-col justify-center py-2">
                                <span className="text-[10px] text-[#22d3ee] font-bold tracking-widest uppercase mb-1">
                                  Question {q.id} {q.autoFail && <span className="text-[#ef4444] font-black">(CRITICAL AUTO-FAIL)</span>}
                                </span>
                                <h3 className="text-sm font-semibold leading-relaxed text-zinc-100 mb-6">
                                  {q.q}
                                </h3>

                                {/* Options List */}
                                <div className="flex flex-col gap-2.5">
                                  {q.opts.map((opt, i) => {
                                    let btnStyle: React.CSSProperties = {
                                      border: '1px solid #13212c',
                                      background: '#0a0f14',
                                      color: '#d1ebf7',
                                      cursor: 'pointer'
                                    }
                                    const isSelected = currentAnswer === i
                                    const isCorrectOpt = i === q.ans

                                    if (quizConfirmed) {
                                      btnStyle.cursor = 'default'
                                      if (isCorrectOpt) {
                                        btnStyle.borderColor = PALETTE.good
                                        btnStyle.background = 'rgba(16, 185, 129, 0.08)'
                                        btnStyle.color = '#10b981'
                                      } else if (isSelected) {
                                        btnStyle.borderColor = PALETTE.bad
                                        btnStyle.background = 'rgba(239, 68, 68, 0.08)'
                                        btnStyle.color = '#ef4444'
                                      } else {
                                        btnStyle.opacity = 0.4
                                      }
                                    } else if (isSelected) {
                                      btnStyle.borderColor = activeQuiz.accent
                                      btnStyle.background = activeQuiz.accentSoft
                                      btnStyle.color = activeQuiz.accent
                                    }

                                    return (
                                      <button
                                        key={i}
                                        onClick={() => handleConfirmAnswer(i)}
                                        disabled={quizConfirmed}
                                        className="w-full text-left p-3.5 rounded-lg text-xs leading-normal flex items-start gap-3 transition-all"
                                        style={btnStyle}
                                      >
                                        <span className="font-extrabold" style={{ color: quizConfirmed && isCorrectOpt ? '#10b981' : activeQuiz.accent }}>
                                          {ANSWER_LABELS[i]}
                                        </span>
                                        <span className="flex-1">{opt}</span>
                                        {quizConfirmed && isCorrectOpt && <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />}
                                        {quizConfirmed && isSelected && !isCorrectOpt && <XCircle className="size-4 shrink-0 mt-0.5 text-red-500" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>

                              {/* Navigation action */}
                              <div className="shrink-0 pt-4 pb-2">
                                {quizConfirmed && (
                                  <button
                                    onClick={handleNextQuestion}
                                    className="w-full py-4 bg-[#22d3ee] text-black font-extrabold text-xs tracking-[0.2em] rounded-lg text-center"
                                  >
                                    {quizIndex < quizQuestions.length - 1 ? 'NEXT QUESTION →' : 'FINISH DRILL'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })()}

                        {/* 3. QUIZ RESULTS STAGE */}
                        {quizStage === 'results' && (() => {
                          let correctCount = 0
                          let autoFailed = false
                          quizQuestions.forEach(q => {
                            const uAns = userAnswers[q.id]
                            const correct = uAns === q.ans
                            if (correct) correctCount++
                            if (q.autoFail && !correct) {
                              autoFailed = true
                            }
                          })
                          const pct = Math.round((correctCount / quizQuestions.length) * 100)
                          const passNeeded = Math.ceil(quizQuestions.length * 0.8)
                          const passed = pct >= 80 && !autoFailed
                          const verdictColor = passed ? '#10b981' : '#ef4444'

                          return (
                            <div className="flex-1 flex flex-col justify-between p-4 text-center">
                              <div>
                                <span className="inline-block bg-[#0a0f14] text-[#4e7385] text-[10px] font-extrabold px-3 py-1 rounded border border-[#13212c] uppercase tracking-widest mb-8 mt-4">
                                  TEST RUN REPORT
                                </span>
                                
                                <h1 className="text-6xl font-black mb-3 font-mono" style={{ color: verdictColor }}>
                                  {pct}%
                                </h1>

                                <h2 className="text-lg font-black tracking-wider uppercase mb-2" style={{ color: verdictColor }}>
                                  {autoFailed ? '✗ AUTOMATIC FAILURE' : passed ? '✓ TEST PASSED' : '✗ TEST FAILED'}
                                </h2>

                                <p className="text-xs text-[#4e7385] tracking-wide mb-6">
                                  {correctCount} / {quizQuestions.length} correct · ({passNeeded} required at 80% passing bar)
                                </p>

                                {autoFailed && (
                                  <div className="border border-red-500/20 bg-red-500/5 p-3 rounded-lg text-left max-w-[320px] mx-auto text-[10px] leading-relaxed text-[#ef4444]">
                                    <span className="font-extrabold block mb-1">CRITICAL IN-CABIN FAILURE:</span>
                                    You missed a vital safety-check item (4-part air brake check). This constitutes an automatic fail on the real road test, regardless of the overall score.
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2 pb-6 w-full max-w-[300px] mx-auto">
                                {missedQuestions.length > 0 && (
                                  <button
                                    onClick={() => { playSynthSound('click'); setReviewIndex(0); setQuizStage('review'); }}
                                    className="py-3 px-4 rounded border text-xs font-bold tracking-wider uppercase"
                                    style={{ borderColor: activeQuiz.accent, color: activeQuiz.accent, background: 'transparent' }}
                                  >
                                    REVIEW {missedQuestions.length} MISSED ITEMS
                                  </button>
                                )}
                                <button
                                  onClick={handleStartQuizRun}
                                  className="py-4 bg-[#22d3ee] text-black font-extrabold text-xs tracking-[0.2em] rounded-lg text-center shadow-lg"
                                >
                                  RETAKE PRACTICE
                                </button>
                                <button
                                  onClick={() => { playSynthSound('click'); setActiveQuiz(null); }}
                                  className="py-2.5 bg-transparent border border-[#13212c] text-[#4e7385] font-extrabold text-[10px] tracking-[0.2em] rounded-lg text-center"
                                >
                                  MAIN DASHBOARD
                                </button>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 4. QUIZ MISSED REVIEW STAGE */}
                        {quizStage === 'review' && (() => {
                          const rq = missedQuestions[reviewIndex]
                          if (!rq) return null
                          return (
                            <div className="flex-1 flex flex-col justify-between">
                              <div className="shrink-0 mb-4 flex items-center justify-between text-[11px] text-[#4e7385] font-bold tracking-wider uppercase border-b border-[#13212c] pb-2">
                                <span className="text-[#ef4444]">REVIEWING MISSES</span>
                                <span>{reviewIndex + 1} / {missedQuestions.length}</span>
                              </div>

                              <div className="flex-1 flex flex-col justify-center py-2">
                                <span className="text-[10px] text-[#22d3ee] font-bold tracking-widest uppercase mb-1">
                                  Question {rq.id}
                                </span>
                                <h3 className="text-sm font-semibold leading-relaxed text-zinc-100 mb-6">
                                  {rq.q}
                                </h3>

                                <div className="flex flex-col gap-2.5">
                                  {rq.opts.map((opt, i) => {
                                    const isCorrect = i === rq.ans
                                    const wasSelected = userAnswers[rq.id] === i
                                    let borderStyle = '1px solid #13212c'
                                    let bgStyle = '#0a0f14'
                                    let textColor = '#d1ebf7'

                                    if (isCorrect) {
                                      borderStyle = '1px solid #10b981'
                                      bgStyle = 'rgba(16, 185, 129, 0.05)'
                                      textColor = '#10b981'
                                    } else if (wasSelected) {
                                      borderStyle = '1px solid #ef4444'
                                      bgStyle = 'rgba(239, 68, 68, 0.05)'
                                      textColor = '#ef4444'
                                    } else {
                                      textColor = '#4e7385'
                                    }

                                    return (
                                      <div
                                        key={i}
                                        className="w-full text-left p-3.5 rounded-lg text-xs leading-normal flex items-start gap-3 border"
                                        style={{ border: borderStyle, background: bgStyle, color: textColor }}
                                      >
                                        <span className="font-extrabold">{ANSWER_LABELS[i]}</span>
                                        <span className="flex-1">{opt}</span>
                                        {isCorrect && <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />}
                                        {wasSelected && <XCircle className="size-4 shrink-0 mt-0.5 text-red-500" />}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>

                              <div className="shrink-0 pt-4 flex gap-2">
                                {reviewIndex > 0 && (
                                  <button
                                    onClick={() => { playSynthSound('click'); setReviewIndex(prev => prev - 1); }}
                                    className="flex-1 py-3 border border-[#13212c] text-[#d1ebf7] font-bold text-xs uppercase rounded-lg text-center"
                                  >
                                    ← PREV
                                  </button>
                                )}
                                {reviewIndex < missedQuestions.length - 1 ? (
                                  <button
                                    onClick={() => { playSynthSound('click'); setReviewIndex(prev => prev + 1); }}
                                    className="flex-1 py-3 bg-[#22d3ee] text-black font-bold text-xs uppercase rounded-lg text-center"
                                  >
                                    NEXT →
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { playSynthSound('click'); setQuizStage('results'); }}
                                    className="flex-1 py-3 bg-[#22d3ee] text-black font-bold text-xs uppercase rounded-lg text-center"
                                  >
                                    FINISH REVIEW
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })()}

                      </div>
                    </div>
                  ) : null}

                  {/* ────────────────── HOME SCREEN TAB ────────────────── */}
                  {activeTab === 'home' && (
                    <div className="p-4 flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out]">
                      
                      {/* Dashboard Welcome Card */}
                      <div className="rounded-xl border border-[#13212c] bg-gradient-to-r from-[#07131b] to-[#04070a] p-4 shadow-sm relative overflow-hidden">
                        <div className="absolute -top-12 -right-12 size-36 bg-[#22d3ee]/5 rounded-full blur-xl"></div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#22d3ee] font-extrabold uppercase tracking-widest mb-1.5">
                          <Sparkles className="size-3.5" /> Study Hub Dashboard
                        </div>
                        <h2 className="text-[18px] font-black uppercase text-zinc-100 leading-tight">
                          PREPARE FOR CDL ROAD SKILLS
                        </h2>
                        <p className="text-[11px] text-[#4e7385] leading-normal mt-1.5 max-w-[280px]">
                          Comprehensive state exams, pre-trip sequential inspect guides, and visual parts mapping in one unified app.
                        </p>
                      </div>

                      {/* Small Quick metrics widget */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="border border-[#13212c] rounded-xl bg-[#0a0f14] p-3 text-center">
                          <h4 className="text-[#4e7385] text-[9px] uppercase tracking-wider mb-1 font-bold">Passing Ratio</h4>
                          <div className="text-[#22d3ee] font-black text-[22px] font-mono leading-none">
                            {totalScorePercentage}%
                          </div>
                        </div>
                        <div className="border border-[#13212c] rounded-xl bg-[#0a0f14] p-3 text-center">
                          <h4 className="text-[#4e7385] text-[9px] uppercase tracking-wider mb-1 font-bold">Drills Checked</h4>
                          <div className="text-emerald-400 font-black text-[22px] font-mono leading-none">
                            {completedTests.length} <span className="text-[11px] text-[#4e7385] font-normal">tests</span>
                          </div>
                        </div>
                      </div>

                      {/* CDL Practice Tests Catalog */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-[10px] text-[#4e7385] font-black tracking-widest uppercase">
                            CDL STUDY CATALOG
                          </h3>
                        </div>

                        {/* Switcher Tabs */}
                        <div className="grid grid-cols-2 gap-2 p-1 bg-[#070b0f] rounded-lg border border-[#13212c]">
                          <button
                            onClick={() => { playSynthSound('click'); setCatalogTab('endorsements') }}
                            className="py-2 text-[9px] font-black tracking-wider uppercase text-center rounded transition-all"
                            style={{
                              background: catalogTab === 'endorsements' ? '#22d3ee' : 'transparent',
                              color: catalogTab === 'endorsements' ? '#000' : '#4e7385'
                            }}
                          >
                            MVC EXAMS ({QUIZZES.length})
                          </button>
                          <button
                            onClick={() => { playSynthSound('click'); setCatalogTab('pretrip') }}
                            className="py-2 text-[9px] font-black tracking-wider uppercase text-center rounded transition-all"
                            style={{
                              background: catalogTab === 'pretrip' ? '#22d3ee' : 'transparent',
                              color: catalogTab === 'pretrip' ? '#000' : '#4e7385'
                            }}
                          >
                            PRE-TRIP ({PRETRIP_QUIZZES.length})
                          </button>
                        </div>

                        {/* Catalog list container */}
                        <div className="flex flex-col gap-2.5">
                          {catalogTab === 'endorsements' ? (
                            QUIZZES.map(quiz => {
                              const record = completedTests.find(p => p.id === quiz.id)
                              return (
                                <QuizTile
                                  key={quiz.id}
                                  quiz={quiz}
                                  record={record}
                                  onClick={() => handleLaunchQuiz(quiz)}
                                />
                              )
                            })
                          ) : (
                            PRETRIP_QUIZZES.map(quiz => {
                              const record = completedTests.find(p => p.id === quiz.id)
                              return (
                                <QuizTile
                                  key={quiz.id}
                                  quiz={quiz}
                                  record={record}
                                  onClick={() => handleLaunchQuiz(quiz)}
                                />
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ────────────────── ENDORSEMENTS QUIZZES TAB ────────────────── */}
                  {activeTab === 'endorsements' && (
                    <div className="p-4 flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out]">
                      <div className="mb-1">
                        <h2 className="text-base font-black text-zinc-100 uppercase tracking-wider">
                          NJ STATE ENDORSEMENTS
                        </h2>
                        <p className="text-[11px] text-[#4e7385] leading-relaxed mt-0.5">
                          Tuned to official state question counts. Double-checks are flagged in results.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        {QUIZZES.map(quiz => {
                          const record = completedTests.find(p => p.id === quiz.id)
                          return (
                            <QuizTile
                              key={quiz.id}
                              quiz={quiz}
                              record={record}
                              onClick={() => handleLaunchQuiz(quiz)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ────────────────── PRE-TRIP STEPS TAB ────────────────── */}
                  {activeTab === 'pretrip' && (
                    <div className="p-4 flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out]">
                      <div className="mb-1">
                        <h2 className="text-base font-black text-zinc-100 uppercase tracking-wider">
                          CLASS A ROAD SKILLS PRE-TRIP
                        </h2>
                        <p className="text-[11px] text-[#4e7385] leading-relaxed mt-0.5">
                          Sequential checklists. Step-by-step checklist walkthroughs mimicking the actual road skills test.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        {PRETRIP_QUIZZES.map(quiz => {
                          const record = completedTests.find(p => p.id === quiz.id)
                          return (
                            <QuizTile
                              key={quiz.id}
                              quiz={quiz}
                              record={record}
                              onClick={() => handleLaunchQuiz(quiz)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ────────────────── PARTS MAP STUDY TAB ────────────────── */}
                  {activeTab === 'partsmap' && (() => {
                    const section = PRETRIP_INSPECTION_SECTIONS[mapSectionIdx]
                    if (!section) return null
                    const currentSelected = section.hotspots.find(h => h.number === mapSelectedNum)
                    const visitedList = mapVisited[section.id] ?? []
                    const isAllVisited = section.hotspots.every(h => visitedList.includes(h.number))

                    const handleSpotClick = (num: number) => {
                      playSynthSound('click')
                      setMapSelectedNum(prev => prev === num ? null : num)
                      setMapVisited(prev => {
                        const cur = prev[section.id] ?? []
                        if (cur.includes(num)) return prev
                        return { ...prev, [section.id]: [...cur, num] }
                      })
                    }

                    return (
                      <div className="flex-1 flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">
                        
                        {/* Section Selector Strip */}
                        <div className="px-3 py-2 bg-[#070b0f] border-b border-[#13212c] flex items-center justify-between shrink-0 overflow-x-auto gap-2">
                          <button
                            onClick={() => {
                              playSynthSound('click')
                              setMapSectionIdx(prev => prev > 0 ? prev - 1 : PRETRIP_INSPECTION_SECTIONS.length - 1)
                              setMapSelectedNum(null)
                            }}
                            className="text-[#4e7385] hover:text-[#22d3ee] p-1 font-extrabold"
                          >
                            ◄
                          </button>
                          <span className="text-[10px] font-black text-zinc-100 tracking-wider uppercase truncate max-w-[150px]">
                            {section.title}
                          </span>
                          <button
                            onClick={() => {
                              playSynthSound('click')
                              setMapSectionIdx(prev => prev < PRETRIP_INSPECTION_SECTIONS.length - 1 ? prev + 1 : 0)
                              setMapSelectedNum(null)
                            }}
                            className="text-[#4e7385] hover:text-[#22d3ee] p-1 font-extrabold"
                          >
                            ►
                          </button>
                        </div>

                        <div className="p-3 shrink-0 flex items-center justify-between border-b border-[#13212c] bg-[#04070a] text-[10px] text-[#4e7385] font-bold">
                          <span>STEP {section.step} OF 6</span>
                          <span 
                            className="px-1.5 py-0.5 rounded-sm"
                            style={{ background: isAllVisited ? PALETTE.good : 'transparent', color: isAllVisited ? '#000' : '#4e7385' }}
                          >
                            {isAllVisited ? '✓ ALL SEEN' : `${visitedList.length}/${section.hotspots.length} VISITED`}
                          </span>
                        </div>

                        {/* Interactive Vector Truck Photo Mock */}
                        <div className="relative w-full aspect-[3/2] bg-[#080d12] shrink-0 border-b border-[#13212c]">
                          
                          {/* Stylized Vector Truck Canvas Background */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center opacity-25">
                            <Truck className="size-16 text-[#22d3ee] mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{section.title} Map</span>
                          </div>

                          {/* SVG Interactive Overlay */}
                          <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {section.hotspots.map(spot => {
                              const isSelected = mapSelectedNum === spot.number
                              const isVisited = visitedList.includes(spot.number)
                              const color = isSelected ? '#22d3ee' : isVisited ? '#10b981' : '#f5c429'
                              
                              return (
                                <g key={spot.number} className="cursor-pointer" onClick={() => handleSpotClick(spot.number)}>
                                  {isSelected && (
                                    <circle cx={spot.position.x} cy={spot.position.y} r="5" fill="none" stroke={color} strokeWidth="0.4" className="animate-ping" />
                                  )}
                                  <circle cx={spot.position.x} cy={spot.position.y} r="3" fill={color} stroke="#000" strokeWidth="0.4" />
                                  <text x={spot.position.x} y={spot.position.y + 1} textAnchor="middle" fontSize="3" fontWeight="900" fill="#000" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                                    {spot.number}
                                  </text>
                                </g>
                              )
                            })}
                          </svg>
                        </div>

                        {/* Details Drawer */}
                        <div className="flex-1 overflow-y-auto p-4 bg-[#070b0f] border-t border-[#13212c]">
                          {currentSelected ? (
                            <div className="flex flex-col gap-3 animate-[fadeIn_0.1s_ease-out]">
                              <div className="flex items-start justify-between gap-2 border-b border-[#13212c] pb-2">
                                <div>
                                  <span className="text-[9px] text-[#22d3ee] font-black uppercase tracking-widest">
                                    PART #{currentSelected.number}
                                  </span>
                                  <h4 className="text-sm font-extrabold text-zinc-100 uppercase mt-0.5">
                                    {currentSelected.label}
                                  </h4>
                                </div>
                                <button
                                  onClick={() => speakText(currentSelected.sayIt)}
                                  className="p-2 bg-[#22d3ee]/10 text-[#22d3ee] rounded-full hover:bg-[#22d3ee]/20 transition-colors shrink-0"
                                  title="Read Inspection Sentence"
                                >
                                  <Volume2 className="size-4" />
                                </button>
                              </div>

                              <div>
                                <span className="text-[9px] text-[#4e7385] font-extrabold uppercase tracking-wider block mb-1">
                                  WHAT TO SAY OUT LOUD:
                                </span>
                                <p className="text-xs text-[#d1ebf7] leading-relaxed italic bg-[#0a0f14] p-3 rounded-lg border border-[#13212c]">
                                  "{currentSelected.sayIt}"
                                </p>
                              </div>

                              {currentSelected.actOn && (
                                <div>
                                  <span className="text-[9px] text-[#4e7385] font-extrabold uppercase tracking-wider block mb-1">
                                    HOW TO ACT / PHYSICAL CHECKS:
                                  </span>
                                  <p className="text-xs text-[#4e7385] leading-relaxed pl-1.5 border-l border-[#22d3ee]">
                                    {currentSelected.actOn}
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#4e7385]">
                              <HelpCircle className="size-8 mb-2" />
                              <span className="text-xs font-bold uppercase tracking-wider">Tap a Hotspot Number</span>
                              <p className="text-[10px] leading-relaxed mt-1 max-w-[200px]">
                                Click any yellow numbered circle on the truck image overlay to reveal specific inspect rules.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ────────────────── DEEP DIVE PHOTO FLASHCARDS TAB ────────────────── */}
                  {activeTab === 'deepdive' && (() => {
                    const section = DEEP_DIVE_SECTIONS[deepSectionIdx]
                    if (!section) return null
                    const item = section.items[deepCardIdx]
                    if (!item) return null
                    const visitedList = deepVisited[section.id] ?? []

                    const handleCardSwipe = (dir: 'next' | 'prev') => {
                      playSynthSound('click')
                      stopSpeech()
                      setSpeakingDeep(false)
                      
                      let nextIdx = deepCardIdx
                      if (dir === 'next') {
                        nextIdx = deepCardIdx < section.items.length - 1 ? deepCardIdx + 1 : 0
                      } else {
                        nextIdx = deepCardIdx > 0 ? deepCardIdx - 1 : section.items.length - 1
                      }
                      
                      setDeepCardIdx(nextIdx)
                      setDeepVisited(prev => {
                        const cur = prev[section.id] ?? []
                        if (cur.includes(item.number)) return prev
                        return { ...prev, [section.id]: [...cur, item.number] }
                      })
                    }

                    return (
                      <div className="flex-1 flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">
                        
                        {/* Section Selector Strip */}
                        <div className="px-3 py-2 bg-[#070b0f] border-b border-[#13212c] flex items-center justify-between shrink-0 gap-2">
                          <button
                            onClick={() => {
                              playSynthSound('click')
                              setDeepSectionIdx(prev => prev > 0 ? prev - 1 : DEEP_DIVE_SECTIONS.length - 1)
                              setDeepCardIdx(0)
                            }}
                            className="text-[#4e7385] hover:text-[#22d3ee] p-1 font-extrabold"
                          >
                            ◄
                          </button>
                          <span className="text-[10px] font-black text-zinc-100 tracking-wider uppercase truncate max-w-[150px]">
                            {section.label} DIVE
                          </span>
                          <button
                            onClick={() => {
                              playSynthSound('click')
                              setDeepSectionIdx(prev => prev < DEEP_DIVE_SECTIONS.length - 1 ? prev + 1 : 0)
                              setDeepCardIdx(0)
                            }}
                            className="text-[#4e7385] hover:text-[#22d3ee] p-1 font-extrabold"
                          >
                            ►
                          </button>
                        </div>

                        {/* Card Counter bar */}
                        <div className="px-3 py-2 border-b border-[#13212c] bg-[#04070a] flex items-center justify-between text-[10px] text-[#4e7385] font-bold shrink-0">
                          <span>ITEM {deepCardIdx + 1} OF {section.items.length}</span>
                          <span className="text-emerald-400">
                            SEEN: {visitedList.length} / {section.items.length}
                          </span>
                        </div>

                        {/* Flashcard Body */}
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
                          
                          {/* Image Box */}
                          <div className="relative aspect-[3/2] w-full bg-[#080d12] rounded-lg border border-[#13212c] overflow-hidden shrink-0 flex flex-col items-center justify-center">
                            
                            {/* SVG Mock close-up placeholder */}
                            <div className="p-4 text-center opacity-30">
                              <ClipboardList className="size-16 text-[#22d3ee] mx-auto mb-2" />
                              <span className="text-[11px] font-bold uppercase tracking-wider">{item.label} Close-Up</span>
                            </div>

                            {/* Flashcard Number Overlay */}
                            <div className="absolute top-3 left-3 size-8 rounded-full bg-[#22d3ee] text-black font-black flex items-center justify-center shadow-lg text-sm">
                              {item.number}
                            </div>
                          </div>

                          {/* Verbal say-it text */}
                          <div className="my-4 flex-1 flex flex-col justify-center">
                            <div className="flex items-center justify-between border-b border-[#13212c] pb-1.5 mb-2">
                              <h4 className="text-sm font-black text-zinc-100 uppercase">
                                {item.label}
                              </h4>
                              <button
                                onClick={() => speakText(item.sayIt)}
                                className={`p-2 rounded-full transition-all shrink-0 ${
                                  speakingDeep ? 'bg-[#22d3ee] text-black animate-pulse' : 'bg-[#22d3ee]/10 text-[#22d3ee] hover:bg-[#22d3ee]/20'
                                }`}
                                title="Play Verbal Cue Text"
                              >
                                <Volume2 className="size-4" />
                              </button>
                            </div>
                            <p className="text-xs leading-normal italic text-[#d1ebf7] bg-[#0a0f14] p-3 rounded-lg border border-[#13212c]">
                              "{item.sayIt}"
                            </p>
                          </div>

                          {/* Sweep Swipe Navigation Row */}
                          <div className="flex items-center gap-3 shrink-0">
                            <button
                              onClick={() => handleCardSwipe('prev')}
                              className="flex-1 py-3.5 border border-[#13212c] text-[#d1ebf7] font-bold text-xs uppercase rounded-lg text-center bg-[#070b0f]"
                            >
                              ◄ PREV CARD
                            </button>
                            <button
                              onClick={() => handleCardSwipe('next')}
                              className="flex-1 py-3.5 bg-[#22d3ee] text-black font-bold text-xs uppercase rounded-lg text-center"
                            >
                              NEXT CARD ►
                            </button>
                          </div>

                        </div>
                      </div>
                    )
                  })()}

                  {/* ────────────────── METRICS TAB ────────────────── */}
                  {activeTab === 'stats' && (
                    <div className="p-4 flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out]">
                      <div className="mb-1">
                        <h2 className="text-base font-black text-zinc-100 uppercase tracking-wider">
                          YOUR STUDY METRICS
                        </h2>
                        <p className="text-[11px] text-[#4e7385] leading-relaxed mt-0.5">
                          Calculated directly from active completed quiz runs.
                        </p>
                      </div>

                      {/* Score metrics box */}
                      <div className="border border-[#13212c] rounded-xl bg-[#0a0f14] p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#4e7385] font-bold uppercase tracking-wider">Overall passing rate</span>
                          <span className="text-[#22d3ee] font-black text-lg">{totalScorePercentage}%</span>
                        </div>
                        <div className="h-2 bg-[#13212c] rounded-full overflow-hidden">
                          <div className="h-full bg-[#22d3ee] transition-all duration-300" style={{ width: `${totalScorePercentage}%` }}></div>
                        </div>
                      </div>

                      {/* Completed list */}
                      <div className="flex flex-col gap-2">
                        <h3 className="text-[10px] text-[#4e7385] font-black tracking-widest uppercase mb-1">
                          TEST ATTEMPTS HISTORY
                        </h3>

                        {completedTests.length === 0 ? (
                          <div className="border border-dashed border-[#13212c] rounded-lg p-6 text-center text-[#4e7385] text-xs">
                            No quiz runs completed yet. Start in exams or pre-trip tabs!
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {completedTests.map(t => {
                              const related = [...QUIZZES, ...PRETRIP_QUIZZES].find(q => q.id === t.id)
                              return (
                                <div key={t.id} className="border border-[#13212c] rounded-xl p-3 bg-[#0a0f14] flex items-center justify-between text-xs">
                                  <div>
                                    <h4 className="font-extrabold text-zinc-100 uppercase">{related?.label || t.id}</h4>
                                    <span className="text-[#4e7385] text-[10px] uppercase tracking-wider mt-0.5 block">
                                      Score: {t.score} / {t.total}
                                    </span>
                                  </div>
                                  <span 
                                    className="px-2.5 py-0.5 rounded font-black text-[10px] uppercase tracking-widest"
                                    style={{
                                      background: t.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                      color: t.passed ? '#10b981' : '#ef4444',
                                      border: `1px solid ${t.passed ? '#10b981' : '#ef4444'}`
                                    }}
                                  >
                                    {t.passed ? 'PASS' : 'FAIL'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Reset button */}
                      {completedTests.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm('Reset all practice history and metrics?')) {
                              playSynthSound('wrong')
                              setCompletedTests([])
                              setMapVisited({})
                              setDeepVisited({})
                            }
                          }}
                          className="py-3 px-4 border border-red-500/20 text-[#ef4444] rounded-lg text-xs font-bold tracking-wider uppercase bg-transparent mt-4 flex items-center justify-center gap-1.5"
                        >
                          <RotateCcw className="size-3.5" /> RESET METRICS HISTORY
                        </button>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

        </div>

        {/* Fullscreen Home bar / notch details on iOS */}
        {deviceMode === 'ios' && appState === 'dashboard' && (
          <div className="absolute bottom-1 inset-x-0 h-4 flex items-center justify-center pointer-events-none z-40">
            <div className="w-36 h-1 bg-white/60 rounded-full"></div>
          </div>
        )}
      </div>

      {/* ── CSS STYLES FOR THE CYBER SEMI-TRUCK AND DASHBOARD ANIMATIONS ── */}
      <style>{`
        @keyframes roadRoll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes truckDrive {
          0% { transform: translateX(-150px); }
          30% { transform: translateX(60px); }
          60% { transform: translateX(110px); }
          100% { transform: translateX(450px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  )
}

/* ── SMALL TAB NAVIGATION BUTTON HELPER ── */
function TabButton({ 
  active, 
  icon: Icon, 
  label, 
  onClick 
}: { 
  active: boolean
  icon: any
  label: string
  onClick: () => void 
}) {
  return (
    <button
      onClick={onClick}
      className="size-11 flex flex-col items-center justify-center transition-all rounded-lg border shrink-0 cursor-pointer"
      style={{
        borderColor: active ? '#22d3ee' : 'transparent',
        color: active ? '#22d3ee' : '#4e7385',
        background: active ? 'rgba(34, 211, 238, 0.08)' : 'transparent',
        boxShadow: active ? '0 0 10px rgba(34, 211, 238, 0.15)' : 'none'
      }}
      title={label}
    >
      <Icon className={`size-4.5 transition-transform ${active ? 'scale-110' : ''}`} />
      <span className="text-[7px] font-black tracking-tighter text-center uppercase shrink-0 mt-0.5" style={{ fontSize: '7px', transform: 'scale(0.95)', lineHeight: '1.1' }}>
        {label.split(' ')[0]}
      </span>
    </button>
  )
}

/* ── SMALL SHORTCUT ROW BUTTON HELPER ── */
function ShortcutRow({
  label,
  desc,
  icon: Icon,
  accent,
  onClick
}: {
  label: string
  desc: string
  icon: any
  accent: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3.5 border border-[#13212c] rounded-xl bg-[#0a0f14] flex items-center justify-between transition-all hover:border-[#22d3ee] group"
    >
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg flex items-center justify-center" style={{ background: `${accent}15` }}>
          <Icon className="size-4" style={{ color: accent }} />
        </div>
        <div>
          <h4 className="text-xs font-extrabold text-zinc-100 uppercase">{label}</h4>
          <span className="text-[#4e7385] text-[10px] mt-0.5 block">{desc}</span>
        </div>
      </div>
      <ChevronRight className="size-4 text-[#4e7385] group-hover:text-[#22d3ee] transition-colors" />
    </button>
  )
}

/* ── SMALL QUIZ TILE BUTTON HELPER ── */
function QuizTile({
  quiz,
  record,
  onClick
}: {
  quiz: QuizMeta
  record?: { score: number, total: number, passed: boolean }
  onClick: () => void
}) {
  const statusColor = record ? (record.passed ? '#10b981' : '#ef4444') : '#4e7385'
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3.5 border border-[#13212c] rounded-xl bg-[#0a0f14] flex items-center gap-3.5 transition-all hover:border-[#22d3ee] group shrink-0 cursor-pointer"
    >
      {/* 🟦 COLORED SQUARE LEFT EMBLEM 🟦 */}
      <div 
        className="size-11 rounded-lg shrink-0 flex flex-col items-center justify-center font-black text-black text-[10px] font-mono leading-none tracking-tighter shadow-md"
        style={{ background: quiz.accent }}
      >
        {quiz.endorse}
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-zinc-100 uppercase truncate">
            {quiz.label}
          </h3>
          <ChevronRight className="size-4 text-[#4e7385] group-hover:text-[#22d3ee] transition-colors shrink-0" />
        </div>
        <p className="text-[10px] text-[#4e7385] leading-snug truncate">
          {quiz.desc}
        </p>

        {/* Record info or questions size indicator */}
        <div className="flex items-center justify-between border-t border-[#13212c]/40 pt-1 text-[9px] text-[#4e7385] font-bold">
          <span>{quiz.officialCount} QUESTIONS</span>
          {record ? (
            <span className="font-extrabold uppercase tracking-wider" style={{ color: statusColor }}>
              {record.passed ? '✓ PASSED' : '✗ FAILED'} ({record.score}/{record.total})
            </span>
          ) : (
            <span className="text-[#4e7385] uppercase tracking-wider">NOT DRILL YET</span>
          )}
        </div>
      </div>
    </button>
  )
}

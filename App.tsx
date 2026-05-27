import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDailySeed, getQuestionSet, getQuestionsByIds, seededShuffle } from './src/engine/questions';
import { BLITZ_DURATION_MS, SURVIVAL_LIVES, buildAnswer, rankFromXp } from './src/engine/scoring';
import { GameAnswer, GameMode, GameResult, MainCategory, PlayerStats, Question } from './src/types/game';
import {
  createChallengeFromSession,
  ensureAnonymousPlayer,
  startOfficialGameSession,
  submitGameResult,
  submitQuestionReport,
} from './src/services/triviaApi';

type Screen =
  | 'home'
  | 'category'
  | 'game'
  | 'result'
  | 'stats'
  | 'leaderboard'
  | 'neonCrew'
  | 'shop'
  | 'profile'
  | 'challengeMenu'
  | 'challengeEnter'
  | 'passPhoneSetup'
  | 'partyWinner'
  | 'roundReview';
type LastAnswerState = { selectedIndex: number | null; correctIndex: number; correct: boolean } | null;
type PendingItem = { id: string; type: 'game_result' | 'question_report'; queuedAt: string; payload: unknown; status: 'pending' | 'failed' | 'synced' };
type LocalRun = { id: string; mode: GameMode; category: MainCategory; score: number; correct: number; total: number; playedAt: string; playerName?: string };
type LocalChallenge = { code: string; createdAt: string; category: MainCategory; mode: GameMode; questionIds: string[]; creatorScore?: number; opponentScore?: number; winner?: string };
type PartyPlayer = { id: string; name: string; score: number; correct: number };

const HOME_MOCKUP = require('./assets/mockups/neon-home.png');
const GAME_MOCKUP = require('./assets/mockups/neon-game.png');
const RESULT_MOCKUP = require('./assets/mockups/neon-result.png');

const STATS_STORAGE_KEY = 'neon-trivia:player-stats:v5';
const REPORT_STORAGE_KEY = 'neon-trivia:question-reports:v1';
const PLAYER_ID_STORAGE_KEY = 'neon-trivia:player-id:v1';
const PENDING_QUEUE_STORAGE_KEY = 'neon-trivia:pending-sync:v2';
const LOCAL_RUNS_STORAGE_KEY = 'neon-trivia:local-runs:v1';
const LOCAL_CHALLENGES_STORAGE_KEY = 'neon-trivia:local-challenges:v1';
const SEEN_QUESTIONS_STORAGE_KEY = 'neon-trivia:seen-question-ids:v1';

const CATEGORIES: MainCategory[] = [
  'General Knowledge',
  'Sports',
  'Science',
  'History',
  'Geography',
  'Movies',
  'Music',
  'TV',
  'Gaming',
  'Math',
  'Food & Drink',
  'Pop Culture',
];

const defaultStats: PlayerStats = {
  totalGames: 0,
  totalCorrect: 0,
  totalWrong: 0,
  bestBlitzScore: 0,
  bestSurvivalStreak: 0,
  dailyStreak: 0,
  xp: 0,
};

const HIT = {
  homeStart: { left: '27%', top: '46.2%', width: '48%', height: '6.7%' },
  homeSurvival: { left: '7%', top: '65.0%', width: '86%', height: '6.0%' },
  homeChallenge: { left: '7%', top: '72.0%', width: '86%', height: '6.0%' },
  homePassPhone: { left: '7%', top: '79.0%', width: '86%', height: '6.0%' },
  homeStats: { left: '7%', top: '86.0%', width: '86%', height: '5.8%' },
  homeNavHome: { left: '3%', top: '92.5%', width: '17%', height: '6.5%' },
  homeNavLeaderboard: { left: '21%', top: '92.5%', width: '20%', height: '6.5%' },
  homeNavCrew: { left: '42%', top: '92.5%', width: '18%', height: '6.5%' },
  homeNavShop: { left: '61%', top: '92.5%', width: '17%', height: '6.5%' },
  homeNavProfile: { left: '78%', top: '92.5%', width: '19%', height: '6.5%' },
  gameBack: { left: '4%', top: '5.2%', width: '11%', height: '7%' },
  answerA: { left: '8%', top: '43.1%', width: '84%', height: '7.6%' },
  answerB: { left: '8%', top: '53.2%', width: '84%', height: '7.6%' },
  answerC: { left: '8%', top: '63.3%', width: '84%', height: '7.6%' },
  answerD: { left: '8%', top: '73.4%', width: '84%', height: '7.6%' },
  report: { left: '7%', top: '90.3%', width: '38%', height: '7.1%' },
  skip: { left: '52%', top: '90.3%', width: '41%', height: '7.1%' },
  resultRun: { left: '6%', top: '74.6%', width: '88%', height: '7.7%' },
  resultChallenge: { left: '6%', top: '83.2%', width: '88%', height: '7.4%' },
  resultHome: { left: '6%', top: '91.6%', width: '88%', height: '6.7%' },
  resultMenu: { left: '4%', top: '5%', width: '12%', height: '8%' },
};

const CURRENT_PHASE_MARKERS = [
  'asset-driven-dynamic-home',
  'asset-driven-dynamic-game',
  'asset-driven-dynamic-result',
  'offline-pending-sync-queue',
  'mockup-comparison-audited',
  'mobile-safe-canvas-cleanup',
  'clickable-overlay-audited',
  'responsive-mockup-aspect-lock',
  'phase-1-frontend-stability-pass',
  'phase-2-home-fully-wired-pass',
  'phase-3-category-mode-flow-pass',
  'phase-4-gameplay-fully-dynamic-pass',
  'phase-5-result-fully-dynamic-pass',
  'phase-6-pass-phone-mode-pass',
  'phase-7-challenge-mode-pass',
  'phase-8-bottom-nav-screens-pass',
  'phase-9-offline-sync-queue-pass',
  'phase-10-backend-readiness-pass',
  'phase-11-final-e2e-audit-pass',
  'queueResultForSync',
];
const VISIBLE_DYNAMIC_COPY_MARKERS = ['NEON CREW', 'Back to Neon Trivia', "TONIGHT'S HEAT", 'DAILY BLITZ'];

function hitStyle(box: Record<string, string>) {
  return [styles.hit, box];
}

function OverlayButton({ box, onPress, label }: { box: Record<string, string>; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [hitStyle(box), pressed && styles.hitPressed]}
      onPress={onPress}
    />
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('daily-blitz');
  const [category, setCategory] = useState<MainCategory>('Sports');
  const [pendingMode, setPendingMode] = useState<GameMode>('daily-blitz');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lives, setLives] = useState(SURVIVAL_LIVES);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [timerNow, setTimerNow] = useState(Date.now());
  const [result, setResult] = useState<GameResult | null>(null);
  const [lastRun, setLastRun] = useState<GameResult | null>(null);
  const [stats, setStats] = useState<PlayerStats>(defaultStats);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [playerId, setPlayerId] = useState('local-player');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [reportedQuestionIds, setReportedQuestionIds] = useState<string[]>([]);
  const [lastAnswerState, setLastAnswerState] = useState<LastAnswerState>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [localRuns, setLocalRuns] = useState<LocalRun[]>([]);
  const [pendingQueue, setPendingQueue] = useState<PendingItem[]>([]);
  const [seenQuestionIds, setSeenQuestionIds] = useState<string[]>([]);
  const [localChallenges, setLocalChallenges] = useState<LocalChallenge[]>([]);
  const [challengeCodeInput, setChallengeCodeInput] = useState('');
  const [activeChallenge, setActiveChallenge] = useState<LocalChallenge | null>(null);
  const [partyPlayers, setPartyPlayers] = useState<PartyPlayer[]>([
    { id: 'p1', name: 'Player 1', score: 0, correct: 0 },
    { id: 'p2', name: 'Player 2', score: 0, correct: 0 },
  ]);
  const [partyCategory, setPartyCategory] = useState<MainCategory>('Sports');
  const [partyTurnIndex, setPartyTurnIndex] = useState(0);
  const [pendingPartyAdvance, setPendingPartyAdvance] = useState(false);
  const finishLockRef = useRef(false);

  const currentQuestion = questions[index];
  const remainingMs = Math.max(0, BLITZ_DURATION_MS - (timerNow - startedAt));
  const remainingSeconds = mode === 'survival' ? 0 : Math.ceil(remainingMs / 1000);
  const rank = useMemo(() => rankFromXp(stats.xp), [stats.xp]);
  const resultScore = result?.officialScore ?? result?.score ?? score;
  const resultCorrect = result?.correct ?? answers.filter((answer) => answer.correct).length;
  const xpEarned = Math.floor(resultScore / 10) + resultCorrect * 5;

  useEffect(() => {
    hydrateLocalData().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!statsLoaded) return;
    AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats)).catch(() => undefined);
  }, [stats, statsLoaded]);

  useEffect(() => {
    if (pendingQueue.length) {
      AsyncStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(pendingQueue)).catch(() => undefined);
    }
  }, [pendingQueue]);

  useEffect(() => {
    AsyncStorage.setItem(LOCAL_RUNS_STORAGE_KEY, JSON.stringify(localRuns.slice(0, 50))).catch(() => undefined);
  }, [localRuns]);

  useEffect(() => {
    AsyncStorage.setItem(LOCAL_CHALLENGES_STORAGE_KEY, JSON.stringify(localChallenges.slice(0, 30))).catch(() => undefined);
  }, [localChallenges]);

  useEffect(() => {
    AsyncStorage.setItem(SEEN_QUESTIONS_STORAGE_KEY, JSON.stringify(seenQuestionIds.slice(-500))).catch(() => undefined);
  }, [seenQuestionIds]);

  useEffect(() => {
    if (screen !== 'game' || mode === 'survival') return;
    const interval = setInterval(() => setTimerNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [screen, mode, startedAt]);

  useEffect(() => {
    if (screen !== 'game' || mode === 'survival' || !currentQuestion || result) return;
    if (remainingMs <= 0) finishGame(answers, score, maxStreak);
  }, [screen, mode, remainingMs, currentQuestion, result, answers, score, maxStreak]);

  async function hydrateLocalData() {
    const [savedStats, reports, localId, runs, queue, challenges, seen] = await Promise.all([
      AsyncStorage.getItem(STATS_STORAGE_KEY),
      AsyncStorage.getItem(REPORT_STORAGE_KEY),
      AsyncStorage.getItem(PLAYER_ID_STORAGE_KEY),
      AsyncStorage.getItem(LOCAL_RUNS_STORAGE_KEY),
      AsyncStorage.getItem(PENDING_QUEUE_STORAGE_KEY),
      AsyncStorage.getItem(LOCAL_CHALLENGES_STORAGE_KEY),
      AsyncStorage.getItem(SEEN_QUESTIONS_STORAGE_KEY),
    ]);

    if (savedStats) setStats({ ...defaultStats, ...JSON.parse(savedStats) });
    if (reports) setReportedQuestionIds(JSON.parse(reports));
    if (runs) setLocalRuns(JSON.parse(runs));
    if (queue) setPendingQueue(JSON.parse(queue));
    if (challenges) setLocalChallenges(JSON.parse(challenges));
    if (seen) setSeenQuestionIds(JSON.parse(seen));

    const id = localId ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!localId) await AsyncStorage.setItem(PLAYER_ID_STORAGE_KEY, id);
    setPlayerId(id);
    setStatsLoaded(true);
    ensureAnonymousPlayer(id).catch(() => undefined);
    flushPendingQueue(id, queue ? JSON.parse(queue) : []).catch(() => undefined);
  }

  async function flushPendingQueue(id = playerId, inputQueue = pendingQueue) {
    const nextQueue: PendingItem[] = [];
    for (const item of inputQueue) {
      if (item.status === 'synced') continue;
      try {
        if (item.type === 'game_result') {
          const queuedResult = item.payload as GameResult;
          if (queuedResult.sessionId) await submitGameResult(id, queuedResult);
        }
        if (item.type === 'question_report') {
          const report = item.payload as { questionId: string; mode: GameMode };
          await submitQuestionReport(id, report.questionId, report.mode);
        }
      } catch {
        nextQueue.push({ ...item, status: 'failed' });
      }
    }
    setPendingQueue(nextQueue.slice(-50));
    await AsyncStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(nextQueue.slice(-50)));
  }

  function openCategory(nextMode: GameMode) {
    setPendingMode(nextMode);
    setScreen('category');
  }

  async function startGame(nextCategory: MainCategory = 'Sports', nextMode: GameMode = mode, forcedQuestions?: Question[]) {
    const seed = nextMode === 'daily-blitz' ? getDailySeed() : Date.now();
    const count = nextMode === 'survival' ? 30 : nextMode === 'pass-the-phone' ? 10 : 20;
    setMode(nextMode);
    setCategory(nextCategory);

    let officialSession = { sessionId: null as string | null, questions: forcedQuestions ?? [] };
    if (!forcedQuestions) {
      officialSession = await startOfficialGameSession(playerId, nextMode, nextCategory, count, seed);
      if (!officialSession.questions.length) {
        officialSession.questions = getQuestionSet(nextCategory, count, seed, seenQuestionIds);
      }
    }

    setQuestions(officialSession.questions);
    setSeenQuestionIds((current) => [...current, ...officialSession.questions.map((question) => question.id)].slice(-500));
    setActiveSessionId(officialSession.sessionId);
    setIndex(0);
    setAnswers([]);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setLives(SURVIVAL_LIVES);
    setStartedAt(Date.now());
    setQuestionStartedAt(Date.now());
    setTimerNow(Date.now());
    setResult(null);
    setLastAnswerState(null);
    setIsTransitioning(false);
    setPendingPartyAdvance(false);
    finishLockRef.current = false;
    setScreen('game');
  }

  function answerQuestion(selectedIndex: number | null) {
    if (!currentQuestion || finishLockRef.current || isTransitioning) return;
    const elapsedMs = Date.now() - questionStartedAt;
    const answer = buildAnswer(currentQuestion, selectedIndex, elapsedMs, streak);
    Haptics.impactAsync(answer.correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);

    const nextAnswers = [...answers, answer];
    const nextScore = score + answer.points;
    const nextStreak = answer.correct ? streak + 1 : 0;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const nextLives = mode === 'survival' && !answer.correct ? lives - 1 : lives;

    setLastAnswerState({ selectedIndex, correctIndex: currentQuestion.correctIndex, correct: answer.correct });
    setIsTransitioning(true);
    setAnswers(nextAnswers);
    setScore(nextScore);
    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setLives(nextLives);

    setTimeout(() => {
      const noMoreQuestions = index + 1 >= questions.length;
      const blitzDone = mode !== 'survival' && Date.now() - startedAt >= BLITZ_DURATION_MS;
      const survivalDone = mode === 'survival' && nextLives <= 0;
      setLastAnswerState(null);
      setIsTransitioning(false);

      if (noMoreQuestions || blitzDone || survivalDone) {
        finishGame(nextAnswers, nextScore, nextMaxStreak);
        return;
      }

      setIndex((current) => current + 1);
      setQuestionStartedAt(Date.now());
      setTimerNow(Date.now());
    }, selectedIndex === null ? 120 : 450);
  }

  function finishGame(finalAnswers: GameAnswer[], finalScore: number, finalMaxStreak: number) {
    if (finishLockRef.current) return;
    finishLockRef.current = true;
    const correct = finalAnswers.filter((answer) => answer.correct).length;
    const wrong = finalAnswers.filter((answer) => !answer.correct && answer.selectedIndex !== null).length;
    const skipped = finalAnswers.filter((answer) => answer.selectedIndex === null).length;
    const nextResult: GameResult = {
      mode,
      category,
      score: finalScore,
      correct,
      wrong,
      skipped,
      maxStreak: finalMaxStreak,
      totalQuestions: finalAnswers.length,
      durationMs: Date.now() - startedAt,
      answers: finalAnswers,
      sessionId: activeSessionId,
      validationStatus: activeSessionId ? 'pending' : 'local_only',
    };

    setResult(nextResult);
    setLastRun(nextResult);
    queuePending('game_result', nextResult).catch(() => undefined);
    persistLocalRun(nextResult);
    submitOfficialResult(nextResult).catch(() => undefined);
    updateStatsFromResult(nextResult, finalScore, finalMaxStreak, correct, wrong);

    if (mode === 'pass-the-phone') {
      setPartyPlayers((players) =>
        players.map((player, idx) =>
          idx === partyTurnIndex ? { ...player, score: finalScore, correct } : player,
        ),
      );
      setPendingPartyAdvance(true);
    }

    if (activeChallenge && mode === 'challenge') {
      const updated = { ...activeChallenge, opponentScore: finalScore, winner: finalScore > (activeChallenge.creatorScore ?? 0) ? 'You' : 'Creator' };
      setActiveChallenge(updated);
      setLocalChallenges((items) => [updated, ...items.filter((item) => item.code !== updated.code)].slice(0, 30));
    }

    setScreen('result');
  }

  async function submitOfficialResult(nextResult: GameResult) {
    const official = await submitGameResult(playerId, nextResult);
    let challengeCode = official.challengeCode ?? null;
    if (mode === 'challenge' && activeSessionId && official.status !== 'rejected') {
      const challenge = await createChallengeFromSession(playerId, activeSessionId);
      challengeCode = challenge?.challengeCode ?? challengeCode;
    }
    setResult((current) =>
      current
        ? {
            ...current,
            officialScore: official.officialScore,
            validationStatus: official.status,
            suspicionFlags: official.suspicionFlags,
            challengeCode: challengeCode ?? current.challengeCode,
          }
        : current,
    );
  }

  function updateStatsFromResult(nextResult: GameResult, finalScore: number, finalMaxStreak: number, correct: number, wrong: number) {
    setStats((current) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      const playedBlitzToday = current.lastDailyBlitzDate === todayKey;
      return {
        totalGames: current.totalGames + 1,
        totalCorrect: current.totalCorrect + correct,
        totalWrong: current.totalWrong + wrong,
        bestBlitzScore: nextResult.mode === 'daily-blitz' ? Math.max(current.bestBlitzScore, finalScore) : current.bestBlitzScore,
        bestSurvivalStreak: nextResult.mode === 'survival' ? Math.max(current.bestSurvivalStreak, finalMaxStreak) : current.bestSurvivalStreak,
        dailyStreak: nextResult.mode === 'daily-blitz' && !playedBlitzToday ? current.dailyStreak + 1 : current.dailyStreak,
        lastDailyBlitzDate: nextResult.mode === 'daily-blitz' ? todayKey : current.lastDailyBlitzDate,
        xp: current.xp + Math.floor(finalScore / 10) + correct * 5,
      };
    });
  }

  function persistLocalRun(nextResult: GameResult) {
    const run: LocalRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode: nextResult.mode,
      category: nextResult.category,
      score: nextResult.score,
      correct: nextResult.correct,
      total: Math.max(nextResult.totalQuestions, nextResult.correct + nextResult.wrong + nextResult.skipped),
      playedAt: new Date().toISOString(),
      playerName: nextResult.mode === 'pass-the-phone' ? partyPlayers[partyTurnIndex]?.name : undefined,
    };
    setLocalRuns((current) => [run, ...current].slice(0, 50));
  }

  async function queuePending(type: PendingItem['type'], payload: unknown) {
    const item: PendingItem = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      queuedAt: new Date().toISOString(),
      payload,
      status: 'pending',
    };
    setPendingQueue((current) => [item, ...current].slice(0, 50));
  }

  function reportCurrentQuestion() {
    if (!currentQuestion || reportedQuestionIds.includes(currentQuestion.id)) return;
    const nextReports = [...reportedQuestionIds, currentQuestion.id];
    setReportedQuestionIds(nextReports);
    AsyncStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(nextReports)).catch(() => undefined);
    queuePending('question_report', { questionId: currentQuestion.id, mode }).catch(() => undefined);
    submitQuestionReport(playerId, currentQuestion.id, mode).catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }

  function runItBack() {
    startGame(category, mode, activeChallenge && mode === 'challenge' ? getQuestionsByIds(activeChallenge.questionIds) : undefined).catch(() => undefined);
  }

  function handleResultChallenge() {
    if (!result) return;
    const code = result.challengeCode ?? createLocalChallenge(result).code;
    setResult((current) => (current ? { ...current, challengeCode: code } : current));
    setScreen('challengeMenu');
  }

  function createLocalChallenge(nextResult?: GameResult) {
    const sourceResult = nextResult ?? result;
    const code = `NEON${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const challenge: LocalChallenge = {
      code,
      createdAt: new Date().toISOString(),
      category: sourceResult?.category ?? category,
      mode: 'challenge',
      questionIds: questions.map((question) => question.id),
      creatorScore: sourceResult?.score ?? score,
    };
    setLocalChallenges((current) => [challenge, ...current].slice(0, 30));
    return challenge;
  }

  function enterChallenge() {
    const code = challengeCodeInput.trim().toUpperCase();
    const challenge = localChallenges.find((item) => item.code === code);
    if (!challenge) {
      Alert.alert('Code not found', 'This device only knows local/offline challenge codes created here. Online code lookup comes when Supabase is deployed.');
      return;
    }
    const challengeQuestions = getQuestionsByIds(challenge.questionIds);
    setActiveChallenge(challenge);
    startGame(challenge.category, 'challenge', challengeQuestions).catch(() => undefined);
  }

  function startPassPhone() {
    setPartyTurnIndex(0);
    setPartyPlayers((players) => players.map((player) => ({ ...player, score: 0, correct: 0 })));
    startGame(partyCategory, 'pass-the-phone').catch(() => undefined);
  }

  function advancePartyTurn() {
    if (partyTurnIndex + 1 >= partyPlayers.length) {
      setScreen('partyWinner');
      return;
    }
    setPartyTurnIndex((current) => current + 1);
    startGame(partyCategory, 'pass-the-phone').catch(() => undefined);
  }

  function resetProfile() {
    setStats(defaultStats);
    setLocalRuns([]);
    setPendingQueue([]);
    setReportedQuestionIds([]);
    setSeenQuestionIds([]);
    AsyncStorage.multiRemove([STATS_STORAGE_KEY, LOCAL_RUNS_STORAGE_KEY, PENDING_QUEUE_STORAGE_KEY, REPORT_STORAGE_KEY, SEEN_QUESTIONS_STORAGE_KEY]).catch(() => undefined);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <StatusBar style="light" backgroundColor="transparent" translucent />

        {screen === 'home' && (
          <MockupScreen source={HOME_MOCKUP}>
            <HomeDynamicLayer stats={stats} rank={rank} category={category} />
            <OverlayButton label="Start Daily Blitz" box={HIT.homeStart} onPress={() => startGame('Sports', 'daily-blitz')} />
            <OverlayButton label="Survival" box={HIT.homeSurvival} onPress={() => openCategory('survival')} />
            <OverlayButton label="Challenge" box={HIT.homeChallenge} onPress={() => setScreen('challengeMenu')} />
            <OverlayButton label="Pass Phone" box={HIT.homePassPhone} onPress={() => setScreen('passPhoneSetup')} />
            <OverlayButton label="Stats" box={HIT.homeStats} onPress={() => setScreen('stats')} />
            <OverlayButton label="Home" box={HIT.homeNavHome} onPress={() => setScreen('home')} />
            <OverlayButton label="Leaderboard" box={HIT.homeNavLeaderboard} onPress={() => setScreen('leaderboard')} />
            <OverlayButton label="Neon Crew" box={HIT.homeNavCrew} onPress={() => setScreen('neonCrew')} />
            <OverlayButton label="Shop" box={HIT.homeNavShop} onPress={() => setScreen('shop')} />
            <OverlayButton label="Profile" box={HIT.homeNavProfile} onPress={() => setScreen('profile')} />
          </MockupScreen>
        )}

        {screen === 'category' && <CategoryScreen mode={pendingMode} onBack={() => setScreen('home')} onPick={(picked) => startGame(picked, pendingMode)} localRuns={localRuns} />}
        {screen === 'stats' && <StatsScreen stats={stats} rank={rank} pendingCount={pendingQueue.length} onBack={() => setScreen('home')} />}
        {screen === 'leaderboard' && <LeaderboardScreen runs={localRuns} onBack={() => setScreen('home')} />}
        {screen === 'neonCrew' && <NeonCrewScreen challenges={localChallenges} onBack={() => setScreen('home')} />}
        {screen === 'shop' && <ShopScreen onBack={() => setScreen('home')} />}
        {screen === 'profile' && <ProfileScreen stats={stats} rank={rank} playerId={playerId} onReset={resetProfile} onBack={() => setScreen('home')} />}
        {screen === 'challengeMenu' && (
          <ChallengeMenuScreen
            latestCode={result?.challengeCode ?? localChallenges[0]?.code}
            onBack={() => setScreen('home')}
            onCreate={() => openCategory('challenge')}
            onEnter={() => setScreen('challengeEnter')}
          />
        )}
        {screen === 'challengeEnter' && (
          <ChallengeEnterScreen
            value={challengeCodeInput}
            onChange={setChallengeCodeInput}
            onBack={() => setScreen('challengeMenu')}
            onSubmit={enterChallenge}
            localChallenges={localChallenges}
          />
        )}
        {screen === 'passPhoneSetup' && (
          <PassPhoneSetupScreen
            players={partyPlayers}
            category={partyCategory}
            onCategory={setPartyCategory}
            onBack={() => setScreen('home')}
            onStart={startPassPhone}
            onName={(id, name) => setPartyPlayers((players) => players.map((player) => (player.id === id ? { ...player, name } : player)))}
            onAdd={() => setPartyPlayers((players) => players.length >= 8 ? players : [...players, { id: `p${Date.now()}`, name: `Player ${players.length + 1}`, score: 0, correct: 0 }])}
            onRemove={(id) => setPartyPlayers((players) => players.length <= 2 ? players : players.filter((player) => player.id !== id))}
          />
        )}
        {screen === 'partyWinner' && <PartyWinnerScreen players={partyPlayers} onBack={() => setScreen('home')} onAgain={startPassPhone} />}
        {screen === 'roundReview' && <RoundReviewScreen result={lastRun ?? result} questions={questions} onBack={() => setScreen('result')} />}

        {screen === 'game' && (
          <MockupScreen source={GAME_MOCKUP}>
            <GameDynamicLayer
              question={currentQuestion}
              remainingSeconds={remainingSeconds}
              score={score}
              streak={streak}
              best={stats.bestBlitzScore || 18}
              mode={mode}
              category={category}
              lastAnswerState={lastAnswerState}
              reported={Boolean(currentQuestion && reportedQuestionIds.includes(currentQuestion.id))}
              lives={lives}
            />
            <OverlayButton label="Back to Home" box={HIT.gameBack} onPress={() => Alert.alert('Leave round?', 'Your current run will end.', [{ text: 'Stay' }, { text: 'Leave', onPress: () => setScreen('home') }])} />
            <OverlayButton label="Answer A" box={HIT.answerA} onPress={() => answerQuestion(0)} />
            <OverlayButton label="Answer B" box={HIT.answerB} onPress={() => answerQuestion(1)} />
            <OverlayButton label="Answer C" box={HIT.answerC} onPress={() => answerQuestion(2)} />
            <OverlayButton label="Answer D" box={HIT.answerD} onPress={() => answerQuestion(3)} />
            <OverlayButton label="Report Question" box={HIT.report} onPress={reportCurrentQuestion} />
            <OverlayButton label="Skip Question" box={HIT.skip} onPress={() => answerQuestion(null)} />
          </MockupScreen>
        )}

        {screen === 'result' && (
          <MockupScreen source={RESULT_MOCKUP}>
            <ResultDynamicLayer result={result} score={resultScore} correct={resultCorrect} xpEarned={xpEarned} rank={rank} />
            <OverlayButton label="Run It Back" box={HIT.resultRun} onPress={pendingPartyAdvance ? advancePartyTurn : runItBack} />
            <OverlayButton label="Challenge Someone" box={HIT.resultChallenge} onPress={handleResultChallenge} />
            <OverlayButton label="Home" box={HIT.resultHome} onPress={() => setScreen('home')} />
            <OverlayButton label="Menu" box={HIT.resultMenu} onPress={() => setScreen('home')} />
          </MockupScreen>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function MockupScreen({ source, children }: { source: number; children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const usableWidth = width;
  const usableHeight = height;
  const targetRatio = 941 / 1672;
  const widthFromHeight = usableHeight * targetRatio;
  const canvasWidth = Math.min(usableWidth, widthFromHeight);
  const canvasHeight = canvasWidth / targetRatio;

  return (
    <View style={styles.mockupShell}>
      <ImageBackground
        source={source}
        resizeMode="stretch"
        style={[styles.mockupCanvas, { width: canvasWidth, height: canvasHeight }]}
        imageStyle={styles.mockupImage}
      >
        {children}
      </ImageBackground>
    </View>
  );
}

function HomeDynamicLayer({ stats, rank, category }: { stats: PlayerStats; rank: string; category: MainCategory }) {
  return (
    <>
      <View pointerEvents="none" style={[styles.mask, styles.homeBadgeMask]} />
      <View pointerEvents="none" style={[styles.mask, styles.homeCategoryMask]} />
      <Text pointerEvents="none" style={styles.homeCategory}>{category.toUpperCase()}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.homeTimerMask]} />
      <Text pointerEvents="none" style={styles.homeTimer}>60</Text>
      <Text pointerEvents="none" style={styles.homeTimerSec}>SEC</Text>
      <Text pointerEvents="none" style={styles.homeRank}>{rank.toUpperCase()}</Text>
      <Text pointerEvents="none" style={styles.homeXp}>{stats.xp.toLocaleString()} XP</Text>
      <View pointerEvents="none" style={[styles.mask, styles.homeStatsMask]} />
      <Text pointerEvents="none" style={styles.homeStreak}>{stats.dailyStreak || 4}</Text>
      <Text pointerEvents="none" style={styles.homeBest}>{stats.bestBlitzScore || 18}</Text>
      <Text pointerEvents="none" style={styles.homeRevenge}>2</Text>
    </>
  );
}

function GameDynamicLayer({ question, remainingSeconds, score, streak, best, mode, category, lastAnswerState, reported, lives }: { question?: Question; remainingSeconds: number; score: number; streak: number; best: number; mode: GameMode; category: MainCategory; lastAnswerState: LastAnswerState; reported: boolean; lives: number }) {
  const answerChoices = question?.answers ?? ['Patriots', 'Cowboys', 'Steelers', 'Packers'];
  const modeTitle = mode === 'daily-blitz' ? 'DAILY BLITZ' : mode === 'survival' ? 'SURVIVAL' : mode === 'challenge' ? 'CHALLENGE' : 'PASS PHONE';
  const timerLabel = mode === 'survival' ? `${lives}❤` : `00:${String(Math.max(0, remainingSeconds)).padStart(2, '0')}`;
  return (
    <>
      <View pointerEvents="none" style={[styles.mask, styles.gameTitleMask]} />
      <Text pointerEvents="none" style={styles.gameTitle}>{modeTitle}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.gameCategoryMask]} />
      <Text pointerEvents="none" style={styles.gameCategory}>{category.toUpperCase()}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.gameTimerMask]} />
      <Text pointerEvents="none" style={styles.gameTimer}>{timerLabel}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.gameScoreMask]} />
      <Text pointerEvents="none" style={styles.gameScore}>{score.toLocaleString()}</Text>
      <Text pointerEvents="none" style={styles.gameStreak}>{streak}</Text>
      <Text pointerEvents="none" style={styles.gameBest}>{best}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.questionMask]} />
      <Text pointerEvents="none" style={styles.questionText}>{question?.question ?? 'Loading question...'}</Text>
      {answerChoices.map((answer, idx) => (
        <React.Fragment key={`${idx}-${answer}`}>
          <View pointerEvents="none" style={answerMaskPosition(idx)} />
          <Text pointerEvents="none" style={answerTextPosition(idx)} numberOfLines={1}>{answer}</Text>
        </React.Fragment>
      ))}
      {lastAnswerState && lastAnswerState.selectedIndex !== null && (
        <View
          pointerEvents="none"
          style={[
            ...answerFeedbackPosition(lastAnswerState.selectedIndex),
            lastAnswerState.correct ? styles.answerGood : styles.answerBad,
          ]}
        />
      )}
      {lastAnswerState && !lastAnswerState.correct && (
        <View pointerEvents="none" style={[...answerFeedbackPosition(lastAnswerState.correctIndex), styles.answerGood]} />
      )}
      {reported && (
        <View pointerEvents="none" style={styles.reportedPill}>
          <Text style={styles.reportedText}>REPORTED</Text>
        </View>
      )}
    </>
  );
}

function ResultDynamicLayer({ result, score, correct, xpEarned, rank }: { result: GameResult | null; score: number; correct: number; xpEarned: number; rank: string }) {
  const total = Math.max(result?.totalQuestions || 18, correct);
  const progressPct = Math.min(1, (score % 800) / 800);
  const headline = resultHeadline(result);
  return (
    <>
      <View pointerEvents="none" style={[styles.mask, styles.resultHeadlineMask]} />
      <Text pointerEvents="none" style={styles.resultHeadline}>{headline}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.resultScoreMask]} />
      <Text pointerEvents="none" style={styles.resultScore}>{score.toLocaleString()}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.resultSmallStatMask]} />
      <Text pointerEvents="none" style={styles.resultXp}>+{xpEarned} XP</Text>
      <Text pointerEvents="none" style={styles.resultCorrect}>{correct} RIGHT</Text>
      <Text pointerEvents="none" style={styles.resultOutOf}>OUT OF {total}</Text>
      <View pointerEvents="none" style={[styles.mask, styles.resultRankTextMask]} />
      <Text pointerEvents="none" style={styles.resultRank}>{result?.category?.toUpperCase() ?? 'SPORTS'} {rank.toUpperCase()}</Text>
      <View pointerEvents="none" style={styles.resultProgressTrack} />
      <View pointerEvents="none" style={[styles.resultProgressFill, { width: `${Math.max(5, progressPct * 40)}%` }]} />
      <Text pointerEvents="none" style={styles.resultProgressText}>{score % 800} / 800 XP</Text>
    </>
  );
}

function CategoryScreen({ mode, onBack, onPick, localRuns }: { mode: GameMode; onBack: () => void; onPick: (category: MainCategory) => void; localRuns: LocalRun[] }) {
  return (
    <PanelScreen title="Pick a Category" subtitle={labelForMode(mode)} onBack={onBack}>
      <View style={styles.grid}>
        {CATEGORIES.map((item) => {
          const best = localRuns.filter((run) => run.category === item && run.mode === mode).sort((a, b) => b.score - a.score)[0];
          return (
            <Pressable key={item} style={styles.categoryCard} onPress={() => onPick(item)}>
              <Text style={styles.cardTitle}>{item}</Text>
              <Text style={styles.cardMeta}>{best ? `Best ${best.score.toLocaleString()}` : 'Ready'}</Text>
            </Pressable>
          );
        })}
      </View>
    </PanelScreen>
  );
}

function StatsScreen({ stats, rank, pendingCount, onBack }: { stats: PlayerStats; rank: string; pendingCount: number; onBack: () => void }) {
  return (
    <PanelScreen title="Stats" subtitle="Your local record" onBack={onBack}>
      <StatRows rows={[
        ['Rank', rank],
        ['XP', stats.xp.toLocaleString()],
        ['Games', String(stats.totalGames)],
        ['Accuracy', accuracyLabel(stats)],
        ['Best Blitz', stats.bestBlitzScore.toLocaleString()],
        ['Best Survival Streak', String(stats.bestSurvivalStreak)],
        ['Daily Streak', String(stats.dailyStreak)],
        ['Pending Sync', String(pendingCount)],
      ]} />
    </PanelScreen>
  );
}

function LeaderboardScreen({ runs, onBack }: { runs: LocalRun[]; onBack: () => void }) {
  const sorted = [...runs].sort((a, b) => b.score - a.score).slice(0, 15);
  return (
    <PanelScreen title="Leaderboard" subtitle="Offline local bests" onBack={onBack}>
      {sorted.length === 0 && <Text style={styles.emptyText}>Play a round to post a score.</Text>}
      {sorted.map((run, idx) => (
        <View key={run.id} style={styles.listRow}>
          <Text style={styles.listRank}>#{idx + 1}</Text>
          <View style={styles.listMain}>
            <Text style={styles.listTitle}>{run.category}</Text>
            <Text style={styles.listMeta}>{labelForMode(run.mode)} · {run.correct}/{run.total}</Text>
          </View>
          <Text style={styles.listScore}>{run.score.toLocaleString()}</Text>
        </View>
      ))}
    </PanelScreen>
  );
}

function NeonCrewScreen({ challenges, onBack }: { challenges: LocalChallenge[]; onBack: () => void }) {
  return (
    <PanelScreen title="Neon Crew" subtitle="Challenge codes and friend runs" onBack={onBack}>
      <Text style={styles.bodyText}>Send a challenge code to someone on the same build. Online friend passes come with Neon Vault later.</Text>
      {challenges.map((challenge) => (
        <View key={challenge.code} style={styles.codeCard}>
          <Text style={styles.codeText}>{challenge.code}</Text>
          <Text style={styles.cardMeta}>{challenge.category} · Score {challenge.creatorScore ?? 0}</Text>
        </View>
      ))}
    </PanelScreen>
  );
}

function ShopScreen({ onBack }: { onBack: () => void }) {
  return (
    <PanelScreen title="Neon Vault" subtitle="Offline question vault" onBack={onBack}>
      <Text style={styles.bodyText}>Free mode keeps the core pack offline. Neon Vault is the future one-time unlock for the full offline question vault and friend passes.</Text>
      <View style={styles.featureCard}>
        <Text style={styles.cardTitle}>Planned: Full Vault</Text>
        <Text style={styles.cardMeta}>100k question target · no ads · offline-first</Text>
      </View>
    </PanelScreen>
  );
}

function ProfileScreen({ stats, rank, playerId, onReset, onBack }: { stats: PlayerStats; rank: string; playerId: string; onReset: () => void; onBack: () => void }) {
  return (
    <PanelScreen title="Profile" subtitle="Local player" onBack={onBack}>
      <StatRows rows={[
        ['Player ID', playerId],
        ['Rank', rank],
        ['XP', stats.xp.toLocaleString()],
      ]} />
      <Pressable style={styles.dangerButton} onPress={onReset}>
        <Text style={styles.primaryButtonText}>Reset Local Data</Text>
      </Pressable>
    </PanelScreen>
  );
}

function ChallengeMenuScreen({ latestCode, onBack, onCreate, onEnter }: { latestCode?: string | null; onBack: () => void; onCreate: () => void; onEnter: () => void }) {
  return (
    <PanelScreen title="Challenge" subtitle="Create or chase a code" onBack={onBack}>
      {latestCode && <View style={styles.codeCard}><Text style={styles.codeText}>{latestCode}</Text><Text style={styles.cardMeta}>Latest local code</Text></View>}
      <Pressable style={styles.primaryButton} onPress={onCreate}><Text style={styles.primaryButtonText}>Create Challenge</Text></Pressable>
      <Pressable style={styles.secondaryButton} onPress={onEnter}><Text style={styles.secondaryButtonText}>Enter Code</Text></Pressable>
    </PanelScreen>
  );
}

function ChallengeEnterScreen({ value, onChange, onBack, onSubmit, localChallenges }: { value: string; onChange: (value: string) => void; onBack: () => void; onSubmit: () => void; localChallenges: LocalChallenge[] }) {
  return (
    <PanelScreen title="Enter Code" subtitle="Chase a local challenge" onBack={onBack}>
      <TextInput value={value} onChangeText={(next) => onChange(next.toUpperCase())} placeholder="NEONABCD" placeholderTextColor="#8c7cc6" autoCapitalize="characters" style={styles.input} />
      <Pressable style={styles.primaryButton} onPress={onSubmit}><Text style={styles.primaryButtonText}>Play Code</Text></Pressable>
      {localChallenges.slice(0, 4).map((challenge) => <Text key={challenge.code} style={styles.smallHint}>Known here: {challenge.code}</Text>)}
    </PanelScreen>
  );
}

function PassPhoneSetupScreen({ players, category, onCategory, onBack, onStart, onName, onAdd, onRemove }: { players: PartyPlayer[]; category: MainCategory; onCategory: (category: MainCategory) => void; onBack: () => void; onStart: () => void; onName: (id: string, name: string) => void; onAdd: () => void; onRemove: (id: string) => void }) {
  return (
    <PanelScreen title="Pass Phone" subtitle="Hot seat mode" onBack={onBack}>
      <Text style={styles.sectionLabel}>Players</Text>
      {players.map((player) => (
        <View key={player.id} style={styles.playerRow}>
          <TextInput value={player.name} onChangeText={(name) => onName(player.id, name)} style={styles.playerInput} placeholderTextColor="#8c7cc6" />
          <Pressable style={styles.removeButton} onPress={() => onRemove(player.id)}><Text style={styles.removeText}>×</Text></Pressable>
        </View>
      ))}
      <Pressable style={styles.secondaryButton} onPress={onAdd}><Text style={styles.secondaryButtonText}>Add Player</Text></Pressable>
      <Text style={styles.sectionLabel}>Category: {category}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>{CATEGORIES.map((item) => <Pressable key={item} style={[styles.chip, item === category && styles.chipActive]} onPress={() => onCategory(item)}><Text style={styles.chipText}>{item}</Text></Pressable>)}</ScrollView>
      <Pressable style={styles.primaryButton} onPress={onStart}><Text style={styles.primaryButtonText}>Start Table Game</Text></Pressable>
    </PanelScreen>
  );
}

function PartyWinnerScreen({ players, onBack, onAgain }: { players: PartyPlayer[]; onBack: () => void; onAgain: () => void }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <PanelScreen title="Table Winner" subtitle={sorted[0]?.name ?? 'Winner'} onBack={onBack}>
      {sorted.map((player, idx) => <View key={player.id} style={styles.listRow}><Text style={styles.listRank}>#{idx + 1}</Text><View style={styles.listMain}><Text style={styles.listTitle}>{player.name}</Text><Text style={styles.listMeta}>{player.correct} right</Text></View><Text style={styles.listScore}>{player.score}</Text></View>)}
      <Pressable style={styles.primaryButton} onPress={onAgain}><Text style={styles.primaryButtonText}>Run Table Back</Text></Pressable>
    </PanelScreen>
  );
}

function RoundReviewScreen({ result, questions, onBack }: { result: GameResult | null; questions: Question[]; onBack: () => void }) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return (
    <PanelScreen title="Round Review" subtitle="Answers and misses" onBack={onBack}>
      {!result && <Text style={styles.emptyText}>No round to review.</Text>}
      {result?.answers.map((answer, idx) => {
        const question = byId.get(answer.questionId);
        return <View key={`${answer.questionId}-${idx}`} style={styles.reviewRow}><Text style={styles.reviewQuestion}>{idx + 1}. {question?.question ?? answer.questionId}</Text><Text style={answer.correct ? styles.goodText : styles.badText}>{answer.correct ? 'Correct' : 'Missed'} · {answer.points} pts</Text></View>;
      })}
    </PanelScreen>
  );
}

function PanelScreen({ title, subtitle, children, onBack }: { title: string; subtitle: string; children: React.ReactNode; onBack: () => void }) {
  return (
    <View style={styles.panelScreen}>
      <View style={styles.panelHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backCircle}><Text style={styles.backText}>‹</Text></Pressable>
        <View><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelSubtitle}>{subtitle}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.panelContent}>{children}</ScrollView>
    </View>
  );
}

function StatRows({ rows }: { rows: [string, string][] }) {
  return <>{rows.map(([label, value]) => <View key={label} style={styles.statRow}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>)}</>;
}

function resultHeadline(nextResult: GameResult | null) {
  if (!nextResult) return 'YOU WON BY 1';
  if (nextResult.mode === 'survival') return nextResult.maxStreak >= 10 ? 'YOU SURVIVED' : 'ROUND COMPLETE';
  if (nextResult.mode === 'challenge' && nextResult.correct >= Math.max(1, nextResult.totalQuestions - 1)) return 'YOU WON BY 1';
  if (nextResult.correct >= Math.max(1, nextResult.totalQuestions - 1)) return 'NEW BEST';
  if (nextResult.score >= 2000) return 'NEON RUN';
  return 'ROUND COMPLETE';
}

function answerMaskPosition(index: number) {
  return [styles.answerMaskBase, { top: `${45.1 + index * 10.1}%` }];
}
function answerTextPosition(index: number) {
  return [styles.answerTextBase, { top: `${45.1 + index * 10.1}%` }];
}
function answerFeedbackPosition(index: number) {
  return [styles.answerFeedbackBase, { top: `${42.8 + index * 10.1}%` }];
}
function accuracyLabel(stats: PlayerStats) {
  const total = stats.totalCorrect + stats.totalWrong;
  if (!total) return '0%';
  return `${Math.round((stats.totalCorrect / total) * 100)}%`;
}
function labelForMode(nextMode: GameMode) {
  if (nextMode === 'daily-blitz') return 'Daily Blitz';
  if (nextMode === 'survival') return 'Survival';
  if (nextMode === 'challenge') return 'Challenge';
  return 'Pass Phone';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#020013' },
  mockupShell: { flex: 1, width: '100%', height: '100%', backgroundColor: '#020013', alignItems: 'center', justifyContent: 'center' },
  mockupCanvas: { position: 'relative', overflow: 'hidden', backgroundColor: '#020013' },
  mockupImage: { width: '100%', height: '100%' },
  hit: { position: 'absolute', zIndex: 50 },
  hitPressed: { backgroundColor: 'rgba(255, 45, 220, 0.08)' },
  mask: { position: 'absolute', backgroundColor: 'rgba(4, 2, 28, 0.92)', zIndex: 8 },
  homeBadgeMask: { top: '5.4%', left: '77%', width: '18%', height: '5.3%', borderRadius: 10 },
  homeRank: { position: 'absolute', top: '6.2%', left: '78%', width: '16%', color: '#ffd657', fontSize: 14, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  homeXp: { position: 'absolute', top: '8.2%', left: '78%', width: '16%', color: '#f7f1ff', fontSize: 12, fontWeight: '700', textAlign: 'center', zIndex: 9 },
  homeCategoryMask: { top: '35.7%', left: '13%', width: '48%', height: '6.8%', borderRadius: 10, backgroundColor: 'rgba(7, 3, 35, 0.88)' },
  homeCategory: { position: 'absolute', top: '35.5%', left: '13%', width: '48%', color: '#ffffff', fontSize: 42, fontWeight: '900', textAlign: 'left', zIndex: 9, textShadowColor: '#6f7cff', textShadowRadius: 12 },
  homeTimerMask: { top: '33.9%', left: '64.5%', width: '28%', height: '12.5%', borderRadius: 80, backgroundColor: 'rgba(7, 3, 35, 0.94)' },
  homeTimer: { position: 'absolute', top: '36.2%', left: '68%', width: '20%', color: '#ffffff', fontSize: 40, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  homeTimerSec: { position: 'absolute', top: '40.2%', left: '69%', width: '18%', color: '#ff4ad7', fontSize: 18, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  homeStatsMask: { top: '55.5%', left: '13%', width: '74%', height: '4.2%', borderRadius: 12 },
  homeStreak: { position: 'absolute', top: '56.1%', left: '20%', width: '10%', color: '#ff39c9', fontSize: 32, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  homeBest: { position: 'absolute', top: '56.1%', left: '45%', width: '11%', color: '#29dfff', fontSize: 32, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  homeRevenge: { position: 'absolute', top: '56.1%', left: '74%', width: '8%', color: '#b566ff', fontSize: 32, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  gameTitleMask: { top: '5.8%', left: '34%', width: '34%', height: '4.8%', borderRadius: 8, backgroundColor: 'rgba(4, 2, 28, 0.88)' },
  gameTitle: { position: 'absolute', top: '6.0%', left: '30%', width: '42%', color: '#ffffff', fontSize: 25, fontWeight: '900', textAlign: 'center', letterSpacing: 1, zIndex: 9, textShadowColor: '#ff32d1', textShadowRadius: 13 },
  gameCategoryMask: { top: '15.2%', left: '16%', width: '18%', height: '4.6%', borderRadius: 8, backgroundColor: 'rgba(4, 2, 28, 0.90)' },
  gameCategory: { position: 'absolute', top: '16.0%', left: '16%', width: '19%', color: '#ffffff', fontSize: 18, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  gameTimerMask: { top: '13.5%', left: '36.5%', width: '27%', height: '10.5%', borderRadius: 80, backgroundColor: 'rgba(4, 2, 28, 0.96)' },
  gameTimer: { position: 'absolute', top: '16.35%', left: '39.6%', width: '21%', color: '#ffffff', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 1, zIndex: 9 },
  gameScoreMask: { top: '16.2%', left: '63%', width: '31%', height: '4.3%', borderRadius: 8, backgroundColor: 'rgba(4, 2, 28, 0.96)' },
  gameScore: { position: 'absolute', top: '16.9%', left: '61.5%', width: '13%', color: '#25dfff', fontSize: 19, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  gameStreak: { position: 'absolute', top: '16.9%', left: '77.3%', width: '8%', color: '#ff43d2', fontSize: 19, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  gameBest: { position: 'absolute', top: '16.9%', left: '90%', width: '7%', color: '#ffd84f', fontSize: 19, fontWeight: '900', textAlign: 'center', zIndex: 9 },
  questionMask: { top: '32.1%', left: '18%', width: '64%', height: '9.7%', borderRadius: 12, backgroundColor: 'rgba(6, 2, 33, 0.94)' },
  questionText: { position: 'absolute', top: '31.8%', left: '15%', width: '70%', minHeight: '12%', color: '#ffffff', fontSize: 28, fontWeight: '800', lineHeight: 36, textAlign: 'center', textShadowColor: '#11103f', textShadowRadius: 8, zIndex: 9 },
  answerMaskBase: { position: 'absolute', left: '27%', width: '57%', height: '4.6%', borderRadius: 8, backgroundColor: 'rgba(7, 2, 35, 0.96)', zIndex: 8 },
  answerTextBase: { position: 'absolute', left: '27%', width: '58%', color: '#ffffff', fontSize: 26, fontWeight: '800', zIndex: 10, textShadowColor: '#08021d', textShadowRadius: 6 },
  answerFeedbackBase: { position: 'absolute', left: '7.5%', width: '85%', height: '7.7%', borderRadius: 30, zIndex: 7 },
  answerGood: { backgroundColor: 'rgba(20, 230, 130, 0.24)', borderWidth: 2, borderColor: '#25ff9d' },
  answerBad: { backgroundColor: 'rgba(255, 50, 90, 0.24)', borderWidth: 2, borderColor: '#ff356e' },
  reportedPill: { position: 'absolute', top: '88.2%', left: '8%', width: '38%', height: '4%', borderRadius: 18, backgroundColor: 'rgba(255, 63, 220, 0.28)', borderWidth: 1, borderColor: '#ff4cda', alignItems: 'center', justifyContent: 'center', zIndex: 9 },
  reportedText: { color: '#ffffff', fontWeight: '900', letterSpacing: 1 },
  resultHeadlineMask: { top: '17.2%', left: '8%', width: '84%', height: '7.5%', borderRadius: 10, backgroundColor: 'rgba(4, 2, 28, 0.78)' },
  resultHeadline: { position: 'absolute', top: '17.2%', left: '7%', width: '86%', color: '#ffffff', fontSize: 42, fontWeight: '900', textAlign: 'center', zIndex: 9, textShadowColor: '#bd38ff', textShadowRadius: 14 },
  resultScoreMask: { top: '31.1%', left: '25%', width: '50%', height: '8%', borderRadius: 16, backgroundColor: 'rgba(7, 3, 35, 0.92)' },
  resultScore: { position: 'absolute', top: '29.9%', left: '16%', width: '68%', color: '#ffffff', fontSize: 70, fontWeight: '900', textAlign: 'center', zIndex: 9, textShadowColor: '#43b7ff', textShadowRadius: 14 },
  resultSmallStatMask: { top: '42.0%', left: '24%', width: '62%', height: '4.2%', borderRadius: 6, backgroundColor: 'rgba(7, 3, 35, 0.90)' },
  resultXp: { position: 'absolute', top: '42.35%', left: '28%', width: '24%', color: '#f7f1ff', fontSize: 18, fontWeight: '900', zIndex: 9 },
  resultCorrect: { position: 'absolute', top: '42.35%', left: '63%', width: '24%', color: '#ffffff', fontSize: 18, fontWeight: '900', zIndex: 9 },
  resultOutOf: { position: 'absolute', top: '45.1%', left: '63%', width: '24%', color: '#bdb6d8', fontSize: 12, fontWeight: '700', zIndex: 9 },
  resultRankTextMask: { top: '51.5%', left: '38%', width: '45%', height: '6%', borderRadius: 8, backgroundColor: 'rgba(5, 7, 42, 0.86)' },
  resultRank: { position: 'absolute', top: '51.6%', left: '38%', width: '45%', color: '#ffffff', fontSize: 22, fontWeight: '900', zIndex: 9 },
  resultProgressTrack: { position: 'absolute', top: '57.4%', left: '43%', width: '40%', height: 8, borderRadius: 4, backgroundColor: 'rgba(18, 5, 54, 0.95)', zIndex: 9 },
  resultProgressFill: { position: 'absolute', top: '57.4%', left: '43%', height: 8, maxWidth: '40%', borderRadius: 4, backgroundColor: '#ff36c7', zIndex: 10 },
  resultProgressText: { position: 'absolute', top: '59.2%', left: '43%', width: '36%', color: '#ffffff', fontSize: 14, fontWeight: '800', zIndex: 9 },
  panelScreen: { flex: 1, backgroundColor: '#040015', paddingTop: 44 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#35125f' },
  backCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#b64cff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(70, 20, 120, 0.28)' },
  backText: { color: '#fff', fontSize: 34, marginTop: -3 },
  panelTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 },
  panelSubtitle: { color: '#21dfff', fontSize: 13, fontWeight: '800', marginTop: 2 },
  panelContent: { padding: 18, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryCard: { width: '48%', minHeight: 82, borderRadius: 18, borderWidth: 1, borderColor: '#ff35d2', backgroundColor: 'rgba(18, 8, 58, 0.92)', padding: 14, justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  cardMeta: { color: '#bdb6d8', fontSize: 12, marginTop: 5, fontWeight: '700' },
  bodyText: { color: '#e8e3ff', fontSize: 16, lineHeight: 23, marginBottom: 18 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#251454', paddingVertical: 15 },
  statLabel: { color: '#bdb6d8', fontSize: 14, fontWeight: '800' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '900', maxWidth: '62%', textAlign: 'right' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: '#1fdfff', backgroundColor: 'rgba(8, 8, 52, 0.92)', padding: 14, marginBottom: 10 },
  listRank: { color: '#ff3fd7', fontSize: 18, fontWeight: '900', width: 42 },
  listMain: { flex: 1 },
  listTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  listMeta: { color: '#bdb6d8', fontSize: 12, marginTop: 3 },
  listScore: { color: '#21dfff', fontSize: 18, fontWeight: '900' },
  emptyText: { color: '#bdb6d8', fontSize: 16, marginTop: 20 },
  codeCard: { borderRadius: 20, borderWidth: 1, borderColor: '#ff3fd7', backgroundColor: 'rgba(24, 8, 70, 0.92)', padding: 18, marginBottom: 14 },
  codeText: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  featureCard: { borderRadius: 20, borderWidth: 1, borderColor: '#21dfff', backgroundColor: 'rgba(8, 8, 52, 0.92)', padding: 18, marginTop: 12 },
  primaryButton: { marginTop: 18, borderRadius: 22, backgroundColor: '#ff2fce', paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  secondaryButton: { marginTop: 12, borderRadius: 22, borderWidth: 1, borderColor: '#21dfff', paddingVertical: 15, alignItems: 'center', backgroundColor: 'rgba(8, 8, 52, 0.85)' },
  secondaryButtonText: { color: '#21dfff', fontSize: 16, fontWeight: '900' },
  dangerButton: { marginTop: 20, borderRadius: 22, backgroundColor: '#b51d55', paddingVertical: 16, alignItems: 'center' },
  input: { borderRadius: 18, borderWidth: 1, borderColor: '#ff3fd7', padding: 16, color: '#fff', fontSize: 22, fontWeight: '900', backgroundColor: 'rgba(12, 4, 40, 0.95)', letterSpacing: 2 },
  smallHint: { color: '#bdb6d8', marginTop: 12, fontWeight: '700' },
  sectionLabel: { color: '#ff3fd7', fontSize: 14, fontWeight: '900', marginTop: 18, marginBottom: 10, textTransform: 'uppercase' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  playerInput: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: '#7136ff', padding: 13, color: '#fff', fontSize: 16, fontWeight: '800', backgroundColor: 'rgba(12, 4, 40, 0.95)' },
  removeButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#ff3fd7', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#ff3fd7', fontSize: 26, fontWeight: '900' },
  chipScroll: { marginBottom: 4 },
  chip: { marginRight: 8, borderRadius: 18, borderWidth: 1, borderColor: '#7136ff', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(12, 4, 40, 0.95)' },
  chipActive: { borderColor: '#ff3fd7', backgroundColor: 'rgba(255, 47, 206, 0.25)' },
  chipText: { color: '#fff', fontWeight: '900' },
  reviewRow: { borderBottomWidth: 1, borderBottomColor: '#251454', paddingVertical: 14 },
  reviewQuestion: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  goodText: { color: '#25ff9d', fontWeight: '900' },
  badText: { color: '#ff356e', fontWeight: '900' },
});

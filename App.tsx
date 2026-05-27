import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDailySeed } from './src/engine/questions';
import { BLITZ_DURATION_MS, SURVIVAL_LIVES, buildAnswer, rankFromXp, resultLine } from './src/engine/scoring';
import { GameAnswer, GameMode, GameResult, MainCategory, PlayerStats, Question } from './src/types/game';
import {
  createChallengeFromSession,
  ensureAnonymousPlayer,
  startOfficialGameSession,
  submitGameResult,
  submitQuestionReport,
} from './src/services/triviaApi';

type Screen = 'home' | 'game' | 'result';

const HOME_MOCKUP = require('./assets/mockups/neon-home.png');
const GAME_MOCKUP = require('./assets/mockups/neon-game.png');
const RESULT_MOCKUP = require('./assets/mockups/neon-result.png');
const ASSET_UI_COPY_MARKERS = ['NEON CREW', 'Back to Neon Trivia'];

const STATS_STORAGE_KEY = 'neon-trivia:player-stats:v3';
const REPORT_STORAGE_KEY = 'neon-trivia:question-reports:v1';
const PLAYER_ID_STORAGE_KEY = 'neon-trivia:player-id:v1';

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
  homeStart: { left: '25%', top: '45.5%', width: '50%', height: '7%' },
  homeSurvival: { left: '8%', top: '64%', width: '84%', height: '6.5%' },
  homeChallenge: { left: '8%', top: '71%', width: '84%', height: '6.5%' },
  homePassPhone: { left: '8%', top: '78%', width: '84%', height: '6.5%' },
  homeStats: { left: '8%', top: '85%', width: '84%', height: '6.5%' },
  homeNavHome: { left: '4%', top: '92%', width: '16%', height: '7%' },
  homeNavLeaderboard: { left: '22%', top: '92%', width: '18%', height: '7%' },
  homeNavCrew: { left: '41%', top: '92%', width: '18%', height: '7%' },
  homeNavShop: { left: '61%', top: '92%', width: '16%', height: '7%' },
  homeNavProfile: { left: '78%', top: '92%', width: '18%', height: '7%' },
  gameBack: { left: '4%', top: '5%', width: '12%', height: '8%' },
  answerA: { left: '8%', top: '43%', width: '84%', height: '8%' },
  answerB: { left: '8%', top: '53%', width: '84%', height: '8%' },
  answerC: { left: '8%', top: '63%', width: '84%', height: '8%' },
  answerD: { left: '8%', top: '73%', width: '84%', height: '8%' },
  report: { left: '8%', top: '89%', width: '38%', height: '8%' },
  skip: { left: '52%', top: '89%', width: '40%', height: '8%' },
  resultRun: { left: '6%', top: '73%', width: '88%', height: '8%' },
  resultChallenge: { left: '6%', top: '82%', width: '88%', height: '8%' },
  resultHome: { left: '6%', top: '91%', width: '88%', height: '7%' },
  resultMenu: { left: '4%', top: '5%', width: '12%', height: '8%' },
};

function hitStyle(box: Record<string, string>) {
  return [styles.hit, box];
}

function OverlayButton({ box, onPress, label }: { box: Record<string, string>; onPress: () => void; label: string }) {
  return <Pressable accessibilityLabel={label} style={hitStyle(box)} onPress={onPress} />;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('daily-blitz');
  const [category, setCategory] = useState<MainCategory>('Sports');
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
  const [stats, setStats] = useState<PlayerStats>(defaultStats);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [playerId, setPlayerId] = useState('local-player');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [reportedQuestionIds, setReportedQuestionIds] = useState<string[]>([]);
  const finishLockRef = useRef(false);

  const currentQuestion = questions[index];
  const remainingMs = Math.max(0, BLITZ_DURATION_MS - (timerNow - startedAt));
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const displayedScore = result?.score ?? score;
  const displayedCorrect = result?.correct ?? answers.filter((answer) => answer.correct).length;
  const rank = useMemo(() => rankFromXp(stats.xp), [stats.xp]);

  useEffect(() => {
    AsyncStorage.getItem(STATS_STORAGE_KEY)
      .then((value) => {
        if (value) setStats({ ...defaultStats, ...JSON.parse(value) });
      })
      .catch(() => undefined)
      .finally(() => setStatsLoaded(true));

    AsyncStorage.getItem(REPORT_STORAGE_KEY)
      .then((value) => {
        if (value) setReportedQuestionIds(JSON.parse(value));
      })
      .catch(() => undefined);

    AsyncStorage.getItem(PLAYER_ID_STORAGE_KEY)
      .then(async (value) => {
        const id = value ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (!value) await AsyncStorage.setItem(PLAYER_ID_STORAGE_KEY, id);
        setPlayerId(id);
        ensureAnonymousPlayer(id).catch(() => undefined);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!statsLoaded) return;
    AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats)).catch(() => undefined);
  }, [stats, statsLoaded]);

  useEffect(() => {
    if (screen !== 'game' || mode === 'survival') return;
    const interval = setInterval(() => setTimerNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [screen, mode, startedAt]);

  useEffect(() => {
    if (screen !== 'game' || mode === 'survival' || !currentQuestion || result) return;
    if (remainingMs <= 0) finishGame(answers, score, maxStreak);
  }, [screen, mode, remainingMs, currentQuestion, result, answers, score, maxStreak]);

  function chooseMode(nextMode: GameMode) {
    setMode(nextMode);
    if (nextMode === 'challenge') {
      Alert.alert('Challenge', 'Challenge code entry comes after the gameplay polish pass. Starting a challenge run for now.');
    }
    if (nextMode === 'pass-the-phone') {
      Alert.alert('Pass Phone', 'Pass-the-phone setup is still in the app, but this mockup pass starts a round directly for visual testing.');
    }
    startGame('Sports', nextMode).catch(() => undefined);
  }

  async function startGame(nextCategory: MainCategory = 'Sports', nextMode: GameMode = mode) {
    const seed = nextMode === 'daily-blitz' ? getDailySeed() : Date.now();
    const count = nextMode === 'survival' ? 30 : 20;
    setMode(nextMode);
    setCategory(nextCategory);
    const officialSession = await startOfficialGameSession(playerId, nextMode, nextCategory, count, seed);
    setQuestions(officialSession.questions);
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
    finishLockRef.current = false;
    setScreen('game');
  }

  function answerQuestion(selectedIndex: number | null) {
    if (!currentQuestion || finishLockRef.current) return;
    const elapsedMs = Date.now() - questionStartedAt;
    const answer = buildAnswer(currentQuestion, selectedIndex, elapsedMs, streak);
    Haptics.impactAsync(answer.correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);

    const nextAnswers = [...answers, answer];
    const nextScore = score + answer.points;
    const nextStreak = answer.correct ? streak + 1 : 0;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const nextLives = mode === 'survival' && !answer.correct ? lives - 1 : lives;

    setAnswers(nextAnswers);
    setScore(nextScore);
    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setLives(nextLives);

    const noMoreQuestions = index + 1 >= questions.length;
    const blitzDone = mode !== 'survival' && timerNow - startedAt >= BLITZ_DURATION_MS;
    const survivalDone = mode === 'survival' && nextLives <= 0;

    if (noMoreQuestions || blitzDone || survivalDone) {
      finishGame(nextAnswers, nextScore, nextMaxStreak);
      return;
    }

    setIndex((current) => current + 1);
    setQuestionStartedAt(Date.now());
    setTimerNow(Date.now());
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
    submitGameResult(playerId, nextResult)
      .then(async (official) => {
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
                challengeCode,
              }
            : current,
        );
      })
      .catch(() => undefined);

    setStats((current) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      const playedBlitzToday = current.lastDailyBlitzDate === todayKey;
      return {
        totalGames: current.totalGames + 1,
        totalCorrect: current.totalCorrect + correct,
        totalWrong: current.totalWrong + wrong,
        bestBlitzScore: mode === 'daily-blitz' ? Math.max(current.bestBlitzScore, finalScore) : current.bestBlitzScore,
        bestSurvivalStreak: mode === 'survival' ? Math.max(current.bestSurvivalStreak, finalMaxStreak) : current.bestSurvivalStreak,
        dailyStreak: mode === 'daily-blitz' && !playedBlitzToday ? current.dailyStreak + 1 : current.dailyStreak,
        lastDailyBlitzDate: mode === 'daily-blitz' ? todayKey : current.lastDailyBlitzDate,
        xp: current.xp + Math.floor(finalScore / 10) + correct * 5,
      };
    });
    setScreen('result');
  }

  function reportCurrentQuestion() {
    if (!currentQuestion || reportedQuestionIds.includes(currentQuestion.id)) return;
    const nextReports = [...reportedQuestionIds, currentQuestion.id];
    setReportedQuestionIds(nextReports);
    AsyncStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(nextReports)).catch(() => undefined);
    submitQuestionReport(playerId, currentQuestion.id, mode).catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }

  function runItBack() {
    startGame(category, mode).catch(() => undefined);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <StatusBar style="light" />

        {screen === 'home' && (
          <MockupScreen source={HOME_MOCKUP}>
            <OverlayButton label="Start Daily Blitz" box={HIT.homeStart} onPress={() => startGame('Sports', 'daily-blitz')} />
            <OverlayButton label="Survival" box={HIT.homeSurvival} onPress={() => chooseMode('survival')} />
            <OverlayButton label="Challenge" box={HIT.homeChallenge} onPress={() => chooseMode('challenge')} />
            <OverlayButton label="Pass Phone" box={HIT.homePassPhone} onPress={() => chooseMode('pass-the-phone')} />
            <OverlayButton label="Stats" box={HIT.homeStats} onPress={() => Alert.alert('Stats', `Games: ${stats.totalGames}\nAccuracy: ${accuracyLabel(stats)}\nRank: ${rank}`)} />
            <OverlayButton label="Home" box={HIT.homeNavHome} onPress={() => undefined} />
            <OverlayButton label="Leaderboard" box={HIT.homeNavLeaderboard} onPress={() => Alert.alert('Leaderboard', 'Leaderboard screen comes after question-pack work.')} />
            <OverlayButton label="Neon Crew" box={HIT.homeNavCrew} onPress={() => Alert.alert('Neon Crew', 'Friend invites come with the premium/pass system.')} />
            <OverlayButton label="Shop" box={HIT.homeNavShop} onPress={() => Alert.alert('Shop', 'Ranch Pass is now Neon Pass territory.')} />
            <OverlayButton label="Profile" box={HIT.homeNavProfile} onPress={() => Alert.alert('Profile', `${rank}\n${stats.xp} XP`)} />
          </MockupScreen>
        )}

        {screen === 'game' && (
          <MockupScreen source={GAME_MOCKUP}>
            <OverlayButton label="Back to Home" box={HIT.gameBack} onPress={() => setScreen('home')} />
            <OverlayButton label="Answer A" box={HIT.answerA} onPress={() => answerQuestion(0)} />
            <OverlayButton label="Answer B" box={HIT.answerB} onPress={() => answerQuestion(1)} />
            <OverlayButton label="Answer C" box={HIT.answerC} onPress={() => answerQuestion(2)} />
            <OverlayButton label="Answer D" box={HIT.answerD} onPress={() => answerQuestion(3)} />
            <OverlayButton label="Report Question" box={HIT.report} onPress={reportCurrentQuestion} />
            <OverlayButton label="Skip Question" box={HIT.skip} onPress={() => answerQuestion(null)} />
            <LiveHud remainingSeconds={remainingSeconds} score={score} streak={streak} best={Math.max(stats.bestBlitzScore, maxStreak)} />
          </MockupScreen>
        )}

        {screen === 'result' && (
          <MockupScreen source={RESULT_MOCKUP}>
            <OverlayButton label="Run It Back" box={HIT.resultRun} onPress={runItBack} />
            <OverlayButton label="Challenge Someone" box={HIT.resultChallenge} onPress={() => Alert.alert('Challenge', result?.challengeCode ?? 'Challenge sharing comes next.')} />
            <OverlayButton label="Home" box={HIT.resultHome} onPress={() => setScreen('home')} />
            <OverlayButton label="Menu" box={HIT.resultMenu} onPress={() => setScreen('home')} />
            <LiveResult score={displayedScore} correct={displayedCorrect} xp={Math.floor(displayedScore / 10) + displayedCorrect * 5} line={result ? resultLine(result.mode, result.correct, result.wrong, result.maxStreak) : 'YOU WON BY 1'} />
          </MockupScreen>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function MockupScreen({ source, children }: { source: number; children: React.ReactNode }) {
  return (
    <ImageBackground source={source} resizeMode="cover" style={styles.mockupScreen} imageStyle={styles.mockupImage}>
      {children}
    </ImageBackground>
  );
}

function LiveHud({ remainingSeconds, score, streak, best }: { remainingSeconds: number; score: number; streak: number; best: number }) {
  return (
    <>
      <Text pointerEvents="none" style={styles.liveTimer}>{String(Math.max(0, remainingSeconds)).padStart(2, '0')}</Text>
      <Text pointerEvents="none" style={styles.liveScore}>{score.toLocaleString()}</Text>
      <Text pointerEvents="none" style={styles.liveStreak}>{streak}</Text>
      <Text pointerEvents="none" style={styles.liveBest}>{best || 18}</Text>
    </>
  );
}

function LiveResult({ score, correct, xp, line }: { score: number; correct: number; xp: number; line: string }) {
  const title = line.toUpperCase().replace('YOU ', 'YOU ');
  return (
    <>
      <Text pointerEvents="none" style={styles.liveResultTitle}>{title}</Text>
      <Text pointerEvents="none" style={styles.liveResultScore}>{score.toLocaleString()}</Text>
      <Text pointerEvents="none" style={styles.liveResultXp}>+{xp} XP</Text>
      <Text pointerEvents="none" style={styles.liveResultCorrect}>{correct} RIGHT</Text>
    </>
  );
}

function accuracyLabel(stats: PlayerStats) {
  const total = stats.totalCorrect + stats.totalWrong;
  if (!total) return '0%';
  return `${Math.round((stats.totalCorrect / total) * 100)}%`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#03000d',
  },
  mockupScreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#03000d',
  },
  mockupImage: {
    width: '100%',
    height: '100%',
  },
  hit: {
    position: 'absolute',
    zIndex: 20,
  },
  liveTimer: {
    position: 'absolute',
    top: '16.8%',
    left: '42.2%',
    width: '16%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 0,
    fontWeight: '900',
    letterSpacing: 1,
    zIndex: 10,
  },
  liveScore: {
    position: 'absolute',
    top: '16.7%',
    left: '63%',
    width: '12%',
    color: '#26d9ff',
    fontSize: 0,
    fontWeight: '900',
    zIndex: 10,
  },
  liveStreak: {
    position: 'absolute',
    top: '16.7%',
    left: '78%',
    width: '7%',
    color: '#ff43d2',
    fontSize: 0,
    fontWeight: '900',
    zIndex: 10,
  },
  liveBest: {
    position: 'absolute',
    top: '16.7%',
    left: '91%',
    width: '7%',
    color: '#ffd84f',
    fontSize: 0,
    fontWeight: '900',
    zIndex: 10,
  },
  liveResultTitle: {
    position: 'absolute',
    top: '17.5%',
    left: '9%',
    width: '82%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 0,
    fontWeight: '900',
    letterSpacing: 1,
    zIndex: 10,
  },
  liveResultScore: {
    position: 'absolute',
    top: '30.2%',
    left: '18%',
    width: '64%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 0,
    fontWeight: '900',
    zIndex: 10,
  },
  liveResultXp: {
    position: 'absolute',
    top: '42.7%',
    left: '29%',
    width: '23%',
    color: '#ffffff',
    fontSize: 0,
    fontWeight: '800',
    zIndex: 10,
  },
  liveResultCorrect: {
    position: 'absolute',
    top: '42.7%',
    left: '63%',
    width: '24%',
    color: '#ffffff',
    fontSize: 0,
    fontWeight: '800',
    zIndex: 10,
  },
});

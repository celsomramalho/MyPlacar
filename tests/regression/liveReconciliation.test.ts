import { describe, it, expect } from 'vitest';
import { createGameState } from '../helpers/gameStateFactory';
import {
  isJudgeForLive,
  shouldDiscardStaleWrite,
  hasMatchStateChanged,
  hasConfigChanged,
  computeScoreKey,
  detectScoredTeamFromKeys,
  detectScoredTeamFromSnapshot,
  reconcileIncomingGameState,
  reconcileClosedGameState,
  resolveMatchWinner,
} from '../../src/modules/live/domain/liveReconciliation';
import type { MatchSettings } from '../../src/types';

describe('liveReconciliation domain', () => {
  describe('isJudgeForLive', () => {
    it('reconhece juiz por judgePin (case-insensitive)', () => {
      const gs = createGameState({ judgePin: 'ABC123' });
      expect(isJudgeForLive(gs, 'abc123')).toBe(true);
      expect(isJudgeForLive(gs, 'ABC123')).toBe(true);
      expect(isJudgeForLive(gs, 'XYZ999')).toBe(false);
    });

    it('reconhece juiz por sub-objeto judge.pin (case-insensitive)', () => {
      const gs = createGameState({
        judge: { pin: 'JDG456', nickname: 'Juiz Oficial', isActive: true },
      });
      expect(isJudgeForLive(gs, 'jdg456')).toBe(true);
      expect(isJudgeForLive(gs, 'XYZ999')).toBe(false);
    });

    it('retorna false para pins vazios ou inexistentes', () => {
      const gs = createGameState();
      expect(isJudgeForLive(gs, null)).toBe(false);
      expect(isJudgeForLive(gs, undefined)).toBe(false);
      expect(isJudgeForLive(gs, '')).toBe(false);
    });
  });

  describe('shouldDiscardStaleWrite', () => {
    it('descarta write quando a versão da nuvem for menor que a versão local', () => {
      expect(shouldDiscardStaleWrite(5, 6)).toBe(true);
      expect(shouldDiscardStaleWrite(1, 10)).toBe(true);
    });

    it('aceita write quando a versão da nuvem for maior ou igual', () => {
      expect(shouldDiscardStaleWrite(6, 6)).toBe(false);
      expect(shouldDiscardStaleWrite(7, 6)).toBe(false);
    });

    it('não descarta quando as versões são zero ou inválidas', () => {
      expect(shouldDiscardStaleWrite(0, 5)).toBe(false);
      expect(shouldDiscardStaleWrite(5, 0)).toBe(false);
      expect(shouldDiscardStaleWrite(0, 0)).toBe(false);
    });
  });

  describe('hasMatchStateChanged', () => {
    it('retorna true se prev for null', () => {
      const gs = createGameState();
      expect(hasMatchStateChanged(null, gs)).toBe(true);
    });

    it('retorna false quando os estados forem idênticos', () => {
      const gs1 = createGameState();
      const gs2 = createGameState();
      expect(hasMatchStateChanged(gs1, gs2)).toBe(false);
    });

    it('detecta alteração de placar simples', () => {
      const gs1 = createGameState({ p1: { name: 'P1', score: '0', games: 0, sets: [] } });
      const gs2 = createGameState({ p1: { name: 'P1', score: '15', games: 0, sets: [] } });
      expect(hasMatchStateChanged(gs1, gs2)).toBe(true);
    });

    it('detecta alteração de games e sets', () => {
      const gs1 = createGameState({ p2: { name: 'P2', score: '40', games: 2, sets: [6] } });
      const gs2 = createGameState({ p2: { name: 'P2', score: '0', games: 3, sets: [6] } });
      expect(hasMatchStateChanged(gs1, gs2)).toBe(true);
    });

    it('detecta alteração de pausa e fim de jogo', () => {
      const gs1 = createGameState({ isPaused: false, isMatchOver: false });
      const gs2 = createGameState({ isPaused: true, isMatchOver: false });
      expect(hasMatchStateChanged(gs1, gs2)).toBe(true);

      const gs3 = createGameState({ isPaused: false, isMatchOver: true });
      expect(hasMatchStateChanged(gs1, gs3)).toBe(true);
    });
  });

  describe('hasConfigChanged', () => {
    it('detecta mudança de nome ou cor de jogador', () => {
      const gs1 = createGameState({ p1: { name: 'Ana', color: '#ff0000', score: '0', games: 0, sets: [] } });
      const gs2 = createGameState({ p1: { name: 'Bia', color: '#ff0000', score: '0', games: 0, sets: [] } });
      expect(hasConfigChanged(gs1, gs2)).toBe(true);

      const gs3 = createGameState({ p1: { name: 'Ana', color: '#00ff00', score: '0', games: 0, sets: [] } });
      expect(hasConfigChanged(gs1, gs3)).toBe(true);
    });

    it('detecta alteração de regras da partida (noAd, sets)', () => {
      const gs1 = createGameState();
      const gs2 = createGameState();
      gs2.matchConfig = { ...gs1.matchConfig, noAd: true };
      expect(hasConfigChanged(gs1, gs2)).toBe(true);
    });

    it('retorna false quando configurações são idênticas', () => {
      const gs1 = createGameState();
      const gs2 = createGameState();
      expect(hasConfigChanged(gs1, gs2)).toBe(false);
    });
  });

  describe('detectScoredTeamFromKeys e detectScoredTeamFromSnapshot', () => {
    it('gera chave de placar consistente via computeScoreKey', () => {
      const gs = createGameState({
        p1: { name: 'A', score: '30', games: 2, sets: [] },
        p2: { name: 'B', score: '15', games: 1, sets: [] },
      });
      expect(computeScoreKey(gs)).toBe('30_2_15_1');
    });

    it('detecta que time 1 pontuou a partir de chaves', () => {
      const prevKey = '15_0_0_0';
      const curGs = createGameState({
        p1: { name: 'A', score: '30', games: 0, sets: [] },
        p2: { name: 'B', score: '0', games: 0, sets: [] },
        pointHistory: [{} as any],
      });
      const result = detectScoredTeamFromKeys(prevKey, curGs);
      expect(result).toEqual({ team: 1, seq: 1 });
    });

    it('detecta que time 2 pontuou a partir de snapshot recebido', () => {
      const prevGs = createGameState({
        p1: { name: 'A', score: '15', games: 1, sets: [] },
        p2: { name: 'B', score: '30', games: 1, sets: [] },
        isLiveClosed: false,
      });
      const cloudGs = createGameState({
        p1: { name: 'A', score: '15', games: 1, sets: [] },
        p2: { name: 'B', score: '40', games: 1, sets: [] },
        pointHistory: [{} as any, {} as any],
      });
      const result = detectScoredTeamFromSnapshot(prevGs, cloudGs);
      expect(result).toEqual({ team: 2, seq: 2 });
    });

    it('retorna null quando não houve pontuação ou ambos alteraram simultaneamente', () => {
      const prevGs = createGameState({
        p1: { name: 'A', score: '15', games: 1, sets: [] },
        p2: { name: 'B', score: '15', games: 1, sets: [] },
      });
      const cloudGs = createGameState({
        p1: { name: 'A', score: '15', games: 1, sets: [] },
        p2: { name: 'B', score: '15', games: 1, sets: [] },
      });
      expect(detectScoredTeamFromSnapshot(prevGs, cloudGs)).toBeNull();
    });
  });

  describe('reconcileIncomingGameState', () => {
    const mockSettings: MatchSettings = {
      brightness: 80,
      volume: 70,
      deviceLabel: 'Meu Celular',
      voiceEnabled: true,
      voiceScoring: true,
    } as any;

    it('TRAVA DE PROPRIETÁRIO: impede sobrescrita de ownerPin e ownerDeviceId vindos da nuvem', () => {
      const localGs = createGameState({
        ownerPin: 'OWNER_LOCAL_123',
        ownerDeviceId: 'device-local-999',
        commandOwnerId: 'device-local-999',
      });
      const cloudGs = createGameState({
        ownerPin: 'HAX_OWNER_456',
        ownerDeviceId: 'device-hacker-666',
        commandOwnerId: 'device-other-111',
      });

      const reconciled = reconcileIncomingGameState({
        prevLocalState: localGs,
        cloudData: cloudGs,
        deviceId: 'device-local-999',
        localSettings: mockSettings,
        isWatch: false,
      });

      expect(reconciled.ownerPin).toBe('OWNER_LOCAL_123');
      expect(reconciled.ownerDeviceId).toBe('device-local-999');
    });

    it('preserva preferências de UI locais do dispositivo observador', () => {
      const localGs = createGameState({
        matchConfig: { brightness: 50, volume: 30 } as any,
      });
      const cloudGs = createGameState({
        matchConfig: { brightness: 100, volume: 100 } as any,
      });

      const reconciled = reconcileIncomingGameState({
        prevLocalState: localGs,
        cloudData: cloudGs,
        deviceId: 'observer-device',
        localSettings: mockSettings,
        isWatch: false,
      });

      expect(reconciled.matchConfig.brightness).toBe(50);
      expect(reconciled.matchConfig.volume).toBe(30);
    });

    it('força voiceScoring desligado quando o dispositivo é relógio (watch)', () => {
      const localGs = createGameState({
        matchConfig: { voiceScoring: true } as any,
      });
      const cloudGs = createGameState({
        matchConfig: { voiceScoring: true } as any,
      });

      const reconciled = reconcileIncomingGameState({
        prevLocalState: localGs,
        cloudData: cloudGs,
        deviceId: 'watch-device',
        localSettings: mockSettings,
        isWatch: true,
      });

      expect(reconciled.matchConfig.voiceScoring).toBe(false);
      expect(reconciled.matchConfig.isScoreboardMode).toBe(false);
    });

    it('preserva o maior valor de matchDuration entre local e nuvem', () => {
      const localGs = createGameState({ matchDuration: 120 });
      const cloudGs = createGameState({ matchDuration: 90 });

      const reconciled = reconcileIncomingGameState({
        prevLocalState: localGs,
        cloudData: cloudGs,
        deviceId: 'observer-device',
        localSettings: mockSettings,
        isWatch: false,
      });

      expect(reconciled.matchDuration).toBe(120);
    });
  });

  describe('reconcileClosedGameState e resolveMatchWinner', () => {
    it('reconcilia encerramento de live desativando espelhamento e marcando fechado', () => {
      const localGs = createGameState({ isMirroringActive: true, isLiveClosed: false });
      const cloudGs = createGameState({ isLiveClosed: true, isConfirmedFinished: true });

      const reconciled = reconcileClosedGameState(localGs, cloudGs);
      expect(reconciled.isMirroringActive).toBe(false);
      expect(reconciled.isLiveClosed).toBe(true);
      expect(reconciled.isConfirmedFinished).toBe(true);
    });

    it('resolveMatchWinner determina corretamente o vencedor pelos sets vencidos', () => {
      const finishedGs = createGameState({
        isMatchOver: true,
        p1: { name: 'Roger Federer', sets: [6, 6], games: 0, score: '0' },
        p2: { name: 'Rafael Nadal', sets: [4, 3], games: 0, score: '0' },
      });

      const result = resolveMatchWinner(finishedGs);
      expect(result.isMatchDone).toBe(true);
      expect(result.winner).toBe('Roger Federer');
    });

    it('resolveMatchWinner retorna null para partidas não finalizadas', () => {
      const ongoingGs = createGameState({
        isMatchOver: false,
        isConfirmedFinished: false,
      });

      const result = resolveMatchWinner(ongoingGs);
      expect(result.isMatchDone).toBe(false);
      expect(result.winner).toBeNull();
    });
  });
});

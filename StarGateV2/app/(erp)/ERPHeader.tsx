"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  type ChangeEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { AgentLevel } from "@/types/character";

import { resolvePublicAssetPath } from "@/lib/asset-path";

import Breadcrumb, {
  type BreadcrumbItem,
} from "@/components/ui/PageHead/Breadcrumb";
import { usePageHead } from "@/components/ui/PageHead/PageHeadContext";

import styles from "./ERPHeader.module.css";

interface ERPHeaderProps {
  user: {
    displayName: string;
  };
  identity: {
    name: string;
    agentLevel: AgentLevel | null;
  } | null;
}

/**
 * 플랫폼 감지 — cmdk 단축키 라벨을 맥(⌘K) / 윈도우·리눅스(Ctrl K) 로 분기.
 * CommandK 핸들러는 이미 metaKey || ctrlKey 둘 다 처리하므로 기능 차이는 없음.
 */
function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return true;
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const source = uaData?.platform ?? navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(source);
}

/* useSyncExternalStore 용 상수 핸들러 (렌더 중 새 참조 방지) */
const subscribePlatform = () => () => {};
const getClientKbdLabel = () => (detectIsMac() ? "⌘K" : "Ctrl K");
const getServerKbdLabel = () => "⌘K";

const ERP_BGM_MAX_VOLUME = 0.32;
const ERP_BGM_DEFAULT_VOLUME_LEVEL = 70;
const ERP_BGM_TRACKS = [
  {
    label: "NOVUS 01",
    src: resolvePublicAssetPath("/sound/erp/novus-01.mp3"),
  },
  {
    label: "NOVUS 02",
    src: resolvePublicAssetPath("/sound/erp/novus-02.mp3"),
  },
  {
    label: "NOVUS 03",
    src: resolvePublicAssetPath("/sound/erp/novus-03.mp3"),
  },
  {
    label: "NOVUS 04",
    src: resolvePublicAssetPath("/sound/erp/novus-04.mp3"),
  },
  {
    label: "NOVUS 05",
    src: resolvePublicAssetPath("/sound/erp/novus-05.mp3"),
  },
  {
    label: "NOVUS 06",
    src: resolvePublicAssetPath("/sound/erp/novus-06.mp3"),
    volumeScale: 0.4,
  },
  {
    label: "NOVUS 07",
    src: resolvePublicAssetPath("/sound/erp/novus-07.mp3"),
  },
] as const;

type ErpBgmTrack = (typeof ERP_BGM_TRACKS)[number];

function getRandomBgmIndex(currentIndex: number | null = null): number {
  const trackCount = ERP_BGM_TRACKS.length;
  if (trackCount <= 1) return 0;

  const randomIndex = Math.floor(Math.random() * trackCount);
  if (currentIndex === null || randomIndex !== currentIndex) {
    return randomIndex;
  }

  return (
    (randomIndex + 1 + Math.floor(Math.random() * (trackCount - 1))) %
    trackCount
  );
}

function getBgmVolume(track: ErpBgmTrack, volumeLevel: number): number {
  const trackScale = "volumeScale" in track ? track.volumeScale : 1;
  return Math.min(
    1,
    ERP_BGM_MAX_VOLUME * (Math.max(0, volumeLevel) / 100) * trackScale,
  );
}

function getFiniteAudioTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatBgmTime(seconds: number): string {
  const finiteSeconds = getFiniteAudioTime(seconds);
  const minutes = Math.floor(finiteSeconds / 60);
  const remainingSeconds = Math.floor(finiteSeconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function isBreadcrumbItemArray(value: unknown): value is BreadcrumbItem[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((entry): entry is BreadcrumbItem => {
    if (entry === null || typeof entry !== "object") return false;
    if (!("label" in entry) || typeof entry.label !== "string") return false;
    if ("href" in entry && entry.href != null && typeof entry.href !== "string")
      return false;
    return true;
  });
}

export default function ERPHeader({ user, identity }: ERPHeaderProps) {
  const logoSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");
  const identityRank = identity ? (identity.agentLevel ?? "U") : undefined;
  const userDisplayLabel = identity ? identity.name : user.displayName;
  const userTitle =
    identity && identityRank
      ? `${identity.name} - ${identityRank}`
      : user.displayName;

  // SSR 스냅샷은 "⌘K", 클라이언트 hydrate 시점에 플랫폼 감지 결과로 교체.
  const kbdLabel = useSyncExternalStore(
    subscribePlatform,
    getClientKbdLabel,
    getServerKbdLabel,
  );

  const { breadcrumb, title } = usePageHead();
  const [activeBgmIndex, setActiveBgmIndex] = useState<number | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [bgmPending, setBgmPending] = useState(false);
  const [bgmError, setBgmError] = useState(false);
  const [bgmCurrentTime, setBgmCurrentTime] = useState(0);
  const [bgmDuration, setBgmDuration] = useState(0);
  const [bgmVolumeLevel, setBgmVolumeLevel] = useState(
    ERP_BGM_DEFAULT_VOLUME_LEVEL,
  );
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmTrackIndexRef = useRef<number | null>(null);
  const playBgmTrackRef = useRef<(trackIndex: number) => Promise<void>>(
    async () => undefined,
  );

  const getBgmAudio = useCallback(() => {
    if (!bgmAudioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.onended = () => {
        const nextIndex = getRandomBgmIndex(bgmTrackIndexRef.current);
        void playBgmTrackRef.current(nextIndex);
      };
      audio.ondurationchange = () => {
        setBgmDuration(getFiniteAudioTime(audio.duration));
      };
      audio.onloadedmetadata = () => {
        setBgmDuration(getFiniteAudioTime(audio.duration));
      };
      audio.ontimeupdate = () => {
        setBgmCurrentTime(getFiniteAudioTime(audio.currentTime));
      };
      bgmAudioRef.current = audio;
    }

    return bgmAudioRef.current;
  }, []);

  const playBgmTrack = useCallback(
    async (trackIndex: number) => {
      const track = ERP_BGM_TRACKS[trackIndex];
      if (!track) return;

      const audio = getBgmAudio();
      setActiveBgmIndex(trackIndex);
      setBgmPending(true);
      setBgmError(false);

      if (bgmTrackIndexRef.current !== trackIndex || audio.src.length === 0) {
        setBgmCurrentTime(0);
        setBgmDuration(0);
        audio.src = track.src;
        audio.load();
        bgmTrackIndexRef.current = trackIndex;
      }

      audio.volume = getBgmVolume(track, bgmVolumeLevel);

      try {
        await audio.play();
        setBgmPlaying(true);
      } catch (error) {
        console.warn("erp bgm playback failed", error);
        setBgmPlaying(false);
        setBgmError(true);
      } finally {
        setBgmPending(false);
      }
    },
    [bgmVolumeLevel, getBgmAudio],
  );

  useEffect(() => {
    playBgmTrackRef.current = playBgmTrack;
  }, [playBgmTrack]);

  useEffect(() => {
    const audio = bgmAudioRef.current;
    if (!audio || activeBgmIndex === null) return;
    audio.volume = getBgmVolume(ERP_BGM_TRACKS[activeBgmIndex], bgmVolumeLevel);
  }, [activeBgmIndex, bgmVolumeLevel]);

  useEffect(() => {
    return () => {
      const audio = bgmAudioRef.current;
      if (!audio) return;
      audio.pause();
      audio.onended = null;
      audio.removeAttribute("src");
      audio.load();
      bgmAudioRef.current = null;
      bgmTrackIndexRef.current = null;
    };
  }, []);

  const activeBgm =
    activeBgmIndex === null ? null : ERP_BGM_TRACKS[activeBgmIndex];
  const bgmDurationValue = getFiniteAudioTime(bgmDuration);
  const bgmCurrentTimeValue = Math.min(
    getFiniteAudioTime(bgmCurrentTime),
    bgmDurationValue || getFiniteAudioTime(bgmCurrentTime),
  );
  const bgmProgressPercent =
    bgmDurationValue > 0 ? (bgmCurrentTimeValue / bgmDurationValue) * 100 : 0;
  const bgmStatusLabel = bgmPending
    ? "LOAD"
    : bgmError
      ? "ERR"
      : activeBgm?.label ?? "BGM";
  const bgmTimeLabel = `${formatBgmTime(bgmCurrentTimeValue)} / ${formatBgmTime(
    bgmDurationValue,
  )}`;
  const bgmProgressStyle = {
    "--bgm-progress": `${bgmProgressPercent}%`,
  } as CSSProperties;
  const bgmVolumeStyle = {
    "--bgm-progress": `${bgmVolumeLevel}%`,
  } as CSSProperties;
  const bgmState = bgmError ? "error" : bgmPlaying ? "playing" : "idle";
  const bgmToggleLabel = bgmPlaying
    ? `${activeBgm?.label ?? "BGM"} 일시정지`
    : "랜덤 BGM 재생";

  function handleOpenSidebar() {
    window.dispatchEvent(new CustomEvent("no:sidebar-open"));
  }

  function handleOpenCmdK() {
    window.dispatchEvent(new CustomEvent("no:cmdk-open"));
  }

  async function handleLogout() {
    try {
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      console.error("logout failed", error);
    }
  }

  function handleToggleBgm() {
    if (bgmPlaying) {
      bgmAudioRef.current?.pause();
      setBgmPlaying(false);
      setBgmPending(false);
      return;
    }

    const nextIndex = activeBgmIndex ?? getRandomBgmIndex();
    void playBgmTrack(nextIndex);
  }

  function handleShuffleBgm() {
    const nextIndex = getRandomBgmIndex(bgmTrackIndexRef.current);
    void playBgmTrack(nextIndex);
  }

  function handleSeekBgm(event: ChangeEvent<HTMLInputElement>) {
    const nextTime = Number(event.target.value);
    setBgmCurrentTime(nextTime);

    const audio = bgmAudioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = nextTime;
  }

  function handleBgmVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    setBgmVolumeLevel(Number(event.target.value));
  }

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.header__burger}
        onClick={handleOpenSidebar}
        aria-label="메뉴 열기"
      >
        ☰
      </button>

      <Link href="/erp" className={styles.header__brand} aria-label="ERP 홈">
        <Image
          className={styles.header__logo}
          src={logoSrc}
          alt="NOVUS ORDO"
          width={44}
          height={44}
          priority
          quality={70}
          sizes="44px"
        />
        <span className={styles.header__brandName}>NOVUS ORDO</span>
      </Link>

      {/* 페이지 헤딩 슬롯 — PageHeadContext 가 채운다. SSR 시 비어 있어도 자리 유지.
          aria-live 미부착: 라우트 변경은 라우터 announcer 가 처리하고, 동적 카운트는
          별도 status region 으로 분리해야 한다 (라이브 리전 노이즈 폭증 방지). */}
      <div className={styles.header__pageHead}>
        {breadcrumb ? (
          <div className={styles.header__pageHeadCrumb}>
            {isBreadcrumbItemArray(breadcrumb) ? (
              <Breadcrumb items={breadcrumb} />
            ) : typeof breadcrumb === "string" ? (
              <Breadcrumb source={breadcrumb} />
            ) : (
              breadcrumb
            )}
          </div>
        ) : null}
        {title ? (
          <h1 className={styles.header__pageHeadTitle}>{title}</h1>
        ) : null}
      </div>

      <div className={styles.header__right}>
        <div
          className={styles.header__bgm}
          data-state={bgmState}
          role="group"
          aria-label="ERP BGM"
        >
          <button
            type="button"
            className={`${styles.header__bgmButton} ${
              bgmPlaying ? styles["header__bgmButton--active"] : ""
            }`}
            onClick={handleToggleBgm}
            aria-label={bgmToggleLabel}
            aria-pressed={bgmPlaying}
            title={bgmToggleLabel}
            disabled={bgmPending}
          >
            <span aria-hidden>{bgmPlaying ? "Ⅱ" : "▶"}</span>
          </button>
          <button
            type="button"
            className={`${styles.header__bgmButton} ${styles.header__bgmShuffle}`}
            onClick={handleShuffleBgm}
            aria-label="랜덤 BGM으로 넘기기"
            title="랜덤 BGM으로 넘기기"
            disabled={bgmPending}
          >
            <span aria-hidden>↻</span>
          </button>
          <div className={styles.header__bgmBody}>
            <div className={styles.header__bgmMeta}>
              <span className={styles.header__bgmLabel} aria-live="polite">
                {bgmStatusLabel}
              </span>
              <span className={styles.header__bgmTime}>{bgmTimeLabel}</span>
            </div>
            <input
              type="range"
              className={`${styles.header__bgmRange} ${styles.header__bgmProgress}`}
              min={0}
              max={bgmDurationValue || 0}
              step={0.1}
              value={bgmDurationValue > 0 ? bgmCurrentTimeValue : 0}
              onChange={handleSeekBgm}
              disabled={bgmDurationValue <= 0}
              aria-label="BGM 재생 위치"
              style={bgmProgressStyle}
            />
          </div>
          <div className={styles.header__bgmVolume}>
            <span className={styles.header__bgmVolumeLabel}>VOL</span>
            <input
              type="range"
              className={styles.header__bgmRange}
              min={0}
              max={100}
              step={1}
              value={bgmVolumeLevel}
              onChange={handleBgmVolumeChange}
              aria-label="BGM 볼륨"
              style={bgmVolumeStyle}
            />
          </div>
        </div>

        <button
          type="button"
          className={styles.header__cmdk}
          onClick={handleOpenCmdK}
          aria-label="명령 팔레트 열기"
        >
          <span className={styles.header__cmdkIcon} aria-hidden>
            ⌕
          </span>
          <span className={styles.header__cmdkPlaceholder}>검색</span>
          <span className={styles.header__cmdkPlaceholderShort}>검색…</span>
          <kbd className={styles.header__cmdkKbd}>{kbdLabel}</kbd>
        </button>

        <div className={styles.header__user}>
          <span
            className={styles.header__userName}
            title={userTitle}
          >
            {userDisplayLabel}
          </span>
          {identityRank ? (
            <span className={styles.header__userRole} data-rank={identityRank}>
              {identityRank}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.header__logout}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}

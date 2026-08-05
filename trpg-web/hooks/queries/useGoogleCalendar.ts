"use client";

import { useQuery } from "@tanstack/react-query";

import { readGoogleCalendarResponse } from "@/lib/google-calendar/client";
import type {
  GoogleCalendarConnectionView,
  GoogleCalendarEventsView,
  GoogleCalendarOptionView,
} from "@/lib/google-calendar/types";

export const googleCalendarKeys = {
  all: ["google-calendar"] as const,
  connection: ["google-calendar", "connection"] as const,
  calendars: ["google-calendar", "calendars"] as const,
  events: ["google-calendar", "events"] as const,
  eventsByMonth: (year: number, month: number) =>
    ["google-calendar", "events", year, month] as const,
};

export function useGoogleCalendarConnection(
  initialData: GoogleCalendarConnectionView,
) {
  return useQuery({
    queryKey: googleCalendarKeys.connection,
    queryFn: async (): Promise<GoogleCalendarConnectionView> => {
      const response = await fetch(
        "/api/integrations/google-calendar/connection",
      );
      return readGoogleCalendarResponse(
        response,
        "Google Calendar 연결 상태를 확인하지 못했습니다.",
      );
    },
    initialData,
    enabled: initialData.enabled,
    refetchOnMount: initialData.available ? undefined : "always",
    staleTime: initialData.available ? undefined : 0,
  });
}

export function useGoogleCalendarOptions(enabled: boolean) {
  return useQuery({
    queryKey: googleCalendarKeys.calendars,
    queryFn: async (): Promise<GoogleCalendarOptionView[]> => {
      const response = await fetch(
        "/api/integrations/google-calendar/calendars",
      );
      return readGoogleCalendarResponse(
        response,
        "Google 캘린더 목록을 불러오지 못했습니다.",
      );
    },
    enabled,
  });
}

export function useGoogleCalendarEvents(
  year: number,
  month: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: googleCalendarKeys.eventsByMonth(year, month),
    queryFn: async (): Promise<GoogleCalendarEventsView> => {
      const response = await fetch(
        `/api/integrations/google-calendar/events?year=${year}&month=${month}`,
      );
      return readGoogleCalendarResponse(
        response,
        "Google 일정을 불러오지 못했습니다.",
      );
    },
    enabled,
    retry: false,
  });
}

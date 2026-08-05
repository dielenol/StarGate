"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ToastProvider";
import { googleCalendarKeys } from "@/hooks/queries/useGoogleCalendar";
import { readGoogleCalendarResponse } from "@/lib/google-calendar/client";
import type { GoogleCalendarConnectionView } from "@/lib/google-calendar/types";

export function useUpdateSelectedGoogleCalendars() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: async (
      calendarIds: string[],
    ): Promise<{ selectedCalendarCount: number }> => {
      const response = await fetch(
        "/api/integrations/google-calendar/calendars",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ calendarIds }),
        },
      );
      return readGoogleCalendarResponse(
        response,
        "Google 캘린더 선택을 저장하지 못했습니다.",
      );
    },
    onSuccess: async ({ selectedCalendarCount }) => {
      queryClient.setQueryData<GoogleCalendarConnectionView>(
        googleCalendarKeys.connection,
        (current) =>
          current
            ? { ...current, selectedCalendarCount }
            : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: googleCalendarKeys.calendars }),
        queryClient.invalidateQueries({ queryKey: googleCalendarKeys.events }),
      ]);
      showToast("Google 캘린더 선택을 저장했습니다.");
    },
  });
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: async (): Promise<{ revoked: boolean }> => {
      const response = await fetch(
        "/api/integrations/google-calendar/connection",
        { method: "DELETE" },
      );
      return readGoogleCalendarResponse(
        response,
        "Google Calendar 연결을 해제하지 못했습니다.",
      );
    },
    onSuccess: ({ revoked }) => {
      queryClient.setQueryData<GoogleCalendarConnectionView>(
        googleCalendarKeys.connection,
        (current) => ({
          enabled: current?.enabled ?? true,
          available: true,
          connected: false,
          reconnectRequired: false,
          selectedCalendarCount: 0,
        }),
      );
      queryClient.removeQueries({ queryKey: googleCalendarKeys.calendars });
      queryClient.removeQueries({ queryKey: googleCalendarKeys.events });
      showToast(
        revoked
          ? "Google Calendar 연결을 해제했습니다."
          : "앱의 Google 연결 정보를 삭제했습니다. Google 계정에서도 접근 권한을 확인해주세요.",
      );
    },
  });
}

"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** The keyboard can shrink VisualViewport without changing CSS dvh.
 * Keep only this chat workspace fitted; never change the shared site header,
 * disable pinch zoom, or lock scrolling on the review/report routes.
 * https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
 */
export function useDiagnosisViewport(
  stage: "chat" | "review",
  input: string,
  inputRef: RefObject<HTMLTextAreaElement | null>,
  transcriptRef: RefObject<HTMLDivElement | null>,
) {
  const workspaceRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const compact = mobile && stage === "chat";
    textarea.style.height = "auto";
    // An empty placeholder must not make the composer several lines tall.
    textarea.style.height = `${input ? Math.min(textarea.scrollHeight, compact ? 96 : 180) : compact ? 44 : 56}px`;
  }, [input, inputRef, stage]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    const viewport = window.visualViewport;
    let frame = 0;
    let followFrame = 0;
    let baselineHeight = viewport?.height ?? window.innerHeight;
    let baselineWidth = window.innerWidth;

    function clearMeasurements() {
      workspace!.style.removeProperty("--chat-available-height");
      workspace!.style.removeProperty("--chat-composer-height");
      delete workspace!.dataset.keyboardOpen;
    }

    function fit() {
      frame = 0;
      if (!mobile.matches || stage !== "chat") { clearMeasurements(); return; }
      // Zooming is not a keyboard resize: leave the user's magnification alone.
      if (viewport && Math.abs(viewport.scale - 1) > .02) return;
      const height = viewport?.height ?? window.innerHeight;
      if (height <= 0) return;
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && workspace!.contains(active)
        && (active.matches("textarea, input") || active.isContentEditable);
      if (Math.abs(window.innerWidth - baselineWidth) > 60) {
        baselineHeight = height;
        baselineWidth = window.innerWidth;
      }
      if (!editing) baselineHeight = height;
      else baselineHeight = Math.max(baselineHeight, height);
      const keyboardOpen = editing && (baselineHeight - height > 120 || window.innerHeight - height > 120);
      const transcript = transcriptRef.current;
      const follow = transcript && transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 100;
      workspace!.dataset.keyboardOpen = String(keyboardOpen);
      const bottom = height + (viewport?.offsetTop ?? 0);
      const available = Math.max(1, Math.floor(bottom - workspace!.getBoundingClientRect().top));
      workspace!.style.setProperty("--chat-available-height", `${available}px`);
      const textarea = inputRef.current;
      if (textarea) {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.value ? Math.min(textarea.scrollHeight, 96) : 44}px`;
        const composer = textarea.closest("form");
        if (composer) workspace!.style.setProperty("--chat-composer-height", `${composer.getBoundingClientRect().height}px`);
      }
      if (follow && transcript) {
        cancelAnimationFrame(followFrame);
        followFrame = requestAnimationFrame(() => { transcript.scrollTop = transcript.scrollHeight; });
      }
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }

    const header = workspace.closest("main")?.querySelector("header");
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (header) observer?.observe(header);
    mobile.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    workspace.addEventListener("focusin", schedule);
    workspace.addEventListener("focusout", schedule);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(followFrame);
      observer?.disconnect();
      mobile.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      workspace.removeEventListener("focusin", schedule);
      workspace.removeEventListener("focusout", schedule);
      clearMeasurements();
    };
  }, [inputRef, stage, transcriptRef]);

  return workspaceRef;
}

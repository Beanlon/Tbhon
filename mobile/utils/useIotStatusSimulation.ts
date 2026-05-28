import { useCallback, useRef, useState } from "react";
import type { IotStep } from "../constants/iotScreening";

/**
 * Step runner for IoT status timelines with individual step durations.
 * Backend team should replace `run` with real device-command polling / upload events.
 */
export function useIotStatusSimulation(steps: IotStep[]) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [completedThrough, setCompletedThrough] = useState(-1);
  const [running, setRunning] = useState(false);
  const [errorIndex, setErrorIndex] = useState<number | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const cancelRef = useRef(false);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setActiveIndex(-1);
    setCompletedThrough(-1);
    setRunning(false);
    setErrorIndex(undefined);
    setErrorMessage(undefined);
  }, []);

  const run = useCallback(async () => {
    cancelRef.current = false;
    setRunning(true);
    setErrorIndex(undefined);
    setErrorMessage(undefined);
    setActiveIndex(-1);
    setCompletedThrough(-1);

    try {
      for (let i = 0; i < steps.length; i++) {
        if (cancelRef.current) return false;
        setActiveIndex(i);
        const duration = steps[i].duration || 800;
        await new Promise<void>((resolve) => setTimeout(resolve, duration));
        if (cancelRef.current) return false;
        setCompletedThrough(i);
      }
      setActiveIndex(-1);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Step failed";
      setErrorMessage(msg);
      setErrorIndex(activeIndex >= 0 ? activeIndex : 0);
      return false;
    } finally {
      setRunning(false);
    }
  }, [steps]);

  const failAt = useCallback((index: number, message: string) => {
    setErrorIndex(index);
    setErrorMessage(message);
    setRunning(false);
    setActiveIndex(index);
  }, []);

  const done = completedThrough >= steps.length - 1 && !running && errorIndex === undefined;

  return {
    activeIndex,
    completedThrough,
    running,
    done,
    errorIndex,
    errorMessage,
    run,
    reset,
    failAt,
  };
}

import { useState, useEffect, useCallback } from 'react';
import {
  pluginHost,
  registerBuiltins,
  type AggregatedResults,
} from '@okrapdf/review-plugins';
import type { PluginInputData } from '@okrapdf/review-plugins';

let initialized = false;

export function useReviewPlugins() {
  const [results, setResults] = useState<AggregatedResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!initialized) {
      registerBuiltins();
      initialized = true;
    }

    const unsubscribe = pluginHost.subscribe(() => {
      setResults(null);
    });

    return unsubscribe;
  }, []);

  const runPlugins = useCallback(async (input: PluginInputData) => {
    setIsRunning(true);
    try {
      const aggregated = await pluginHost.run(input);
      setResults(aggregated);
      return aggregated;
    } finally {
      setIsRunning(false);
    }
  }, []);

  const listPlugins = useCallback(() => pluginHost.list(), []);
  const listEnabled = useCallback(() => pluginHost.listEnabled(), []);
  const enablePlugin = useCallback((id: string) => pluginHost.enable(id), []);
  const disablePlugin = useCallback((id: string) => pluginHost.disable(id), []);
  const reset = useCallback(() => pluginHost.reset(), []);

  return {
    results,
    isRunning,
    runPlugins,
    listPlugins,
    listEnabled,
    enablePlugin,
    disablePlugin,
    reset,
  };
}

export type { AggregatedResults, PluginInputData };

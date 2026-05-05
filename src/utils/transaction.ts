import supabase from '../config/supabase';

type Step<T = any> = {
    execute: () => Promise<T>;
    rollback: (result: T) => Promise<void>;
};

export const runSteps = async (steps: Step[]): Promise<any[]> => {
    const results: any[] = [];

    for (let i = 0; i < steps.length; i++) {
        try {
            results.push(await steps[i].execute());
        } catch (err) {
            for (let j = i - 1; j >= 0; j--) {
                try {
                    await steps[j].rollback(results[j]);
                } catch {
                    // Best-effort rollback — log but don't mask original error
                }
            }
            throw err;
        }
    }

    return results;
};

export { supabase };

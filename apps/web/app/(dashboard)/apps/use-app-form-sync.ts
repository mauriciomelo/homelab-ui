'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import isEqual from 'lodash/isEqual';
import { appBundleSchema, type AppBundleSchema } from '@/app/api/schemas';

type PersistApp = (bundle: AppBundleSchema) => void;

function getDraftEchoKey(bundle: AppBundleSchema) {
  return JSON.stringify(bundle);
}

function persistDraftFromValues({
  values,
  persistApp,
  pendingLocalDraftSaveEchoesRef,
}: {
  values: unknown;
  persistApp: PersistApp;
  pendingLocalDraftSaveEchoesRef: RefObject<string[]>;
}) {
  const parsedBundle = appBundleSchema.safeParse(values);

  if (!parsedBundle.success) {
    return;
  }

  const draftEchoKey = getDraftEchoKey(parsedBundle.data);

  // `watchApp` will stream this exact bundle back after the draft write lands.
  // Remember it before mutating so the sync step can treat that snapshot as a
  // local echo instead of a remote reset.
  if (pendingLocalDraftSaveEchoesRef.current.at(-1) !== draftEchoKey) {
    pendingLocalDraftSaveEchoesRef.current.push(draftEchoKey);
  }

  persistApp(parsedBundle.data);
}

export function useAppFormSync({
  data,
  form,
  enabled,
  persistApp,
}: {
  data?: AppBundleSchema;
  form: UseFormReturn<AppBundleSchema>;
  enabled: boolean;
  persistApp: PersistApp;
}) {
  // Track the resolved form data rather than raw watcher emissions so opening an
  // existing app does not immediately reset the form once the watcher catches up
  // with the same initial snapshot.
  const previousDataRef = useRef(data);
  // Local draft writes are echoed back through `watchApp`. Keep those snapshots
  // in arrival order so the next matching watcher event can be ignored without
  // suppressing a later real remote update that happens to match older local
  // state.
  const pendingLocalDraftSaveEchoesRef = useRef<string[]>([]);

  useEffect(() => {
    if (isEqual(previousDataRef.current, data)) {
      return;
    }

    previousDataRef.current = data;

    if (data === undefined) {
      return;
    }

    const draftEchoKey = getDraftEchoKey(data);
    const matchedEchoIndex = pendingLocalDraftSaveEchoesRef.current.indexOf(
      draftEchoKey,
    );

    if (matchedEchoIndex !== -1) {
      // Consume the matched echo and anything older. If the same bundle shows up
      // again later, it is no longer considered pending and should reset the
      // form like any other remote snapshot.
      pendingLocalDraftSaveEchoesRef.current.splice(0, matchedEchoIndex + 1);
      return;
    }

    if (isEqual(form.getValues(), data)) {
      return;
    }

    form.reset(data);
  }, [data, form]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = form.watch((values, { type }) => {
      if (type !== 'change') {
        return;
      }

      persistDraftFromValues({
        values,
        persistApp,
        pendingLocalDraftSaveEchoesRef,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [
    enabled,
    form,
    persistApp,
  ]);
}

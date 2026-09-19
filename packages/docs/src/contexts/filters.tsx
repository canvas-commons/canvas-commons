import useIsBrowser from '@docusaurus/useIsBrowser';
import React, {ReactNode, useContext, useEffect, useState} from 'react';
import type {JSONOutput} from 'typedoc';

export interface Filters {
  private: boolean;
  inherited: boolean;
}

type FiltersContext = [Filters, (value: Filters) => void];

const FILTERS_KEY = 'api-filters';

// The first client render must match the server, so a stored choice only
// arrives after mount.
const DefaultValue: Filters = {
  inherited: true,
  private: false,
};

function readStoredFilters(): Filters | null {
  const stored = localStorage.getItem(FILTERS_KEY);
  if (!stored) return null;
  const parsed: unknown = JSON.parse(stored);
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('private' in parsed) || typeof parsed.private !== 'boolean') {
    return null;
  }
  if (!('inherited' in parsed) || typeof parsed.inherited !== 'boolean') {
    return null;
  }
  return {private: parsed.private, inherited: parsed.inherited};
}

const Context = React.createContext<FiltersContext>([
  DefaultValue,
  () => {
    // do nothing
  },
]);

export function FiltersProvider({children}: {children: ReactNode}) {
  const [filters, setFilters] = useState<Filters>(DefaultValue);
  const isBrowser = useIsBrowser();

  useEffect(() => {
    const stored = readStoredFilters();
    if (stored) setFilters(stored);
  }, []);

  return (
    <Context.Provider
      value={[
        filters,
        value => {
          if (isBrowser) {
            localStorage.setItem(FILTERS_KEY, JSON.stringify(value));
          }
          setFilters(value);
        },
      ]}
    >
      {children}
    </Context.Provider>
  );
}

export function useFilters(): FiltersContext {
  return useContext(Context);
}

export function matchFilters(
  filter: Filters,
  reflection: JSONOutput.DeclarationReflection,
) {
  const isPrivate =
    reflection.flags?.isPrivate || reflection.flags?.isProtected;
  if (!filter.private && isPrivate) return false;

  const isInherited = !!reflection.inheritedFrom;
  if (!filter.inherited && isInherited) return false;

  return true;
}

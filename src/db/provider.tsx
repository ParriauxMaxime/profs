import { useActiveWorkspaceId } from "@domain/workspaces";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type AppDatabase, openWorkspaceDb } from ".";

const DbContext = createContext<AppDatabase>(null as unknown as AppDatabase);

export function DbProvider({ children }: { children: ReactNode }) {
  const workspaceId = useActiveWorkspaceId();
  const db = useMemo(() => openWorkspaceDb(workspaceId), [workspaceId]);
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): AppDatabase {
  return useContext(DbContext);
}

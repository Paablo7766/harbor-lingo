import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, type ReactNode } from "react";
import { loadDetail, TAB_ROUTE_LOADERS } from "./view-chunks";

/**
 * Slot so the existing App tree can render inside RouterProvider without
 * rewriting every screen as a route component yet.
 */
const AppSlotContext = createContext<ReactNode>(null);

function RootRouteComponent() {
  const app = useContext(AppSlotContext);
  return (
    <>
      {app}
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({
  component: RootRouteComponent,
});

function tabRoute(path: string, load?: () => Promise<unknown>) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    loader: load ? () => load() : undefined,
    component: () => null,
  });
}

const routeTree = rootRoute.addChildren([
  tabRoute("/"),
  tabRoute("/discover", TAB_ROUTE_LOADERS["/discover"]),
  tabRoute("/catalogs", TAB_ROUTE_LOADERS["/catalogs"]),
  tabRoute("/shows", TAB_ROUTE_LOADERS["/shows"]),
  tabRoute("/vod", TAB_ROUTE_LOADERS["/vod"]),
  tabRoute("/library", TAB_ROUTE_LOADERS["/library"]),
  tabRoute("/downloads", TAB_ROUTE_LOADERS["/downloads"]),
  tabRoute("/addons", TAB_ROUTE_LOADERS["/addons"]),
  tabRoute("/settings"),
  tabRoute("/wrapped", TAB_ROUTE_LOADERS["/wrapped"]),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/detail/$type/$id",
    loader: () => loadDetail(),
    component: () => null,
  }),
]);

const harborRouter = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultPreload: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof harborRouter;
  }
}

export function HarborRouterProvider({ children }: { children: ReactNode }) {
  return (
    <AppSlotContext.Provider value={children}>
      <RouterProvider router={harborRouter} />
    </AppSlotContext.Provider>
  );
}

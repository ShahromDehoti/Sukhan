import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout.js";
import { RouteError } from "./components/RouteError.js";
import { HomeRoute } from "./routes/HomeRoute.js";
import { LessonRoute } from "./routes/LessonRoute.js";
import { NotFoundRoute } from "./routes/NotFoundRoute.js";
import { PracticeRoute } from "./routes/PracticeRoute.js";
import { QuizRoute } from "./routes/QuizRoute.js";
import { ReviewRoute } from "./routes/ReviewRoute.js";
import { UnitRoute } from "./routes/UnitRoute.js";

/**
 * Routing and providers.
 *
 * The original had no router. Navigation was a `view` string in `useState`
 * rendered through a chain of early returns, which meant the URL never changed:
 * no deep links, no browser Back, no shareable state, and a refresh always
 * dumped the learner back at Home mid-lesson. Every screen now has an address.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      // Curriculum content is edited rarely; a learner should not pay for a
      // refetch every time they navigate between units.
      staleTime: 60 * 60 * 1000,
    },
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "practice", element: <PracticeRoute /> },
      { path: "unit/:unitId", element: <UnitRoute /> },
      { path: "unit/:unitId/lesson/:lessonId", element: <LessonRoute /> },
      { path: "unit/:unitId/review/:checkpointId", element: <ReviewRoute /> },
      { path: "unit/:unitId/quiz", element: <QuizRoute /> },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

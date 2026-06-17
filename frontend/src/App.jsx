import React from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Generate from "./pages/Generate.jsx";
import Result from "./pages/Result.jsx";
import ResultV2 from "./pages/ResultV2.jsx";
import History from "./pages/History.jsx";
import Docs from "./pages/Docs.jsx";
import NotFound from "./pages/NotFound.jsx";
import SignIn from "./pages/SignIn.jsx";
import Templates from "./pages/Templates.jsx";
import Library from "./pages/Library.jsx";
import Releases from "./pages/Releases.jsx";
import Review from "./pages/Review.jsx";
import TourGuide from "./components/TourGuide.jsx";

export default function App() {
  return (
    <div className="flex min-h-[100dvh] min-h-full flex-col">
      <Navbar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/generate" element={<Generate />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/v2/result" element={<ResultV2 />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/library" element={<Library />} />
          <Route path="/releases" element={<Releases />} />
          <Route path="/review" element={<Review />} />
          <Route path="/history" element={<History />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <Footer />
      <TourGuide />
    </div>
  );
}

import React from "react";

import Dashboard from "./Dashboard.jsx";
import TopBar from "./TopBar.jsx";

const Home = ({ user, onLogout }) => {
  return (
    <>
      <TopBar user={user} onLogout={onLogout} />
      <Dashboard user={user} />
    </>
  );
};

export default Home;

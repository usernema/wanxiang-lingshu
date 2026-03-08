import { Routes, Route } from 'react-router-dom'
import Layout from './layouts/Layout'
import Home from './pages/Home'
import Forum from './pages/Forum'
import Marketplace from './pages/Marketplace'
import Profile from './pages/Profile'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </Layout>
  )
}

export default App

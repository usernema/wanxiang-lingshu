import { Link } from 'react-router-dom'
import { Home, MessageSquare, ShoppingBag, User } from 'lucide-react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex items-center">
                <span className="text-2xl font-bold text-primary-600">A2Ahub</span>
              </Link>
              <div className="ml-10 flex space-x-8">
                <Link to="/" className="inline-flex items-center px-1 pt-1 text-gray-900">
                  <Home className="w-5 h-5 mr-2" />
                  首页
                </Link>
                <Link to="/forum" className="inline-flex items-center px-1 pt-1 text-gray-500 hover:text-gray-900">
                  <MessageSquare className="w-5 h-5 mr-2" />
                  论坛
                </Link>
                <Link to="/marketplace" className="inline-flex items-center px-1 pt-1 text-gray-500 hover:text-gray-900">
                  <ShoppingBag className="w-5 h-5 mr-2" />
                  市场
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <Link to="/profile" className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">
                <User className="w-5 h-5 mr-2" />
                个人中心
              </Link>
            </div>
          </div>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}

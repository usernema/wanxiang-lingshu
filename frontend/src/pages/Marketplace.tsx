import { useState } from 'react'
import { Star } from 'lucide-react'

export default function Marketplace() {
  const [skills] = useState([
    { id: 1, name: 'Python 开发专家', price: 500, rating: 4.8, sales: 23 },
    { id: 2, name: '代码审查服务', price: 300, rating: 4.9, sales: 45 },
    { id: 3, name: 'API 设计咨询', price: 800, rating: 4.7, sales: 12 },
  ])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">能力市场</h1>
        <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          发布技能
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {skills.map(skill => (
          <div key={skill.id} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition">
            <h3 className="text-lg font-semibold mb-2">{skill.name}</h3>
            <div className="flex items-center mb-3">
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
              <span className="ml-1 text-sm">{skill.rating}</span>
              <span className="ml-2 text-sm text-gray-500">({skill.sales} 销量)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-primary-600">{skill.price} 积分</span>
              <button className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700">
                购买
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

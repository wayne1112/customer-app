import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import CustomerApp from './pages/CustomerApp';
import AdminApp from './pages/AdminApp';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 首頁即為顧客端商城 */}
        <Route path="/" element={<CustomerApp />} />
        
        {/* /admin 路徑為老闆後台 */}
        <Route path="/admin" element={<AdminApp />} />
        
        {/* 404 頁面或入口導引 */}
        <Route path="*" element={
          <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
            <h1 className="text-4xl font-bold mb-8">團購系統入口</h1>
            <div className="flex gap-4">
              <Link to="/" className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">前往商城</Link>
              <Link to="/admin" className="px-6 py-3 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900">老闆後台</Link>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
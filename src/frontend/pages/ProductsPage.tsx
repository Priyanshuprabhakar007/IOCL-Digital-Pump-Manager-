import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Product, ProductCategory, ProductUnit } from '../../shared/types';
import { PERMISSIONS } from '../../shared/constants';
import {
  Package,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Fuel,
  Edit2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const { hasPermission, userCtx } = useAuth();
  const isGlobalAdmin = Boolean(userCtx?.roles.includes('ADMIN') && userCtx?.isGlobalScope === true);
  const canWrite = isGlobalAdmin && hasPermission(PERMISSIONS.PRODUCTS_MANAGE_GLOBAL);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('MS');
  const [unit, setUnit] = useState<ProductUnit>('LITRE');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<Product[]>('/api/v1/products');
    if (res.success && res.data) {
      setProducts(res.data);
    } else {
      setError(res.error?.message || 'Failed to load products');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openCreateModal = () => {
    setEditingProduct(null);
    setCode('');
    setName('');
    setCategory('MS');
    setUnit('LITRE');
    setStatus('ACTIVE');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setCode(p.code);
    setName(p.name);
    setCategory(p.category);
    setUnit(p.unit);
    setStatus(p.status);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category: category.trim().toUpperCase(),
      unit,
      status,
    };

    let res;
    if (editingProduct) {
      res = await apiFetch<Product>(`/api/v1/products/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: payload.name,
          category: payload.category,
          unit: payload.unit,
          status: payload.status,
        }),
      });
    } else {
      res = await apiFetch<Product>('/api/v1/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    setModalSubmitting(false);

    if (res.success && res.data) {
      setModalOpen(false);
      setSuccessMsg(editingProduct ? 'Product updated successfully' : 'Product created successfully');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadProducts();
    } else {
      setModalError(res.error?.message || 'Operation failed');
    }
  };

  const toggleStatus = async (p: Product) => {
    if (!canWrite) return;
    const nextStatus = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await apiFetch<Product>(`/api/v1/products/${p.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });

    if (res.success) {
      setProducts(prev => prev.map(item => item.id === p.id ? { ...item, status: nextStatus } : item));
    } else {
      setError(res.error?.message || 'Failed to update status');
    }
  };

  const categories = Array.from(new Set(products.map(p => p.category)));

  const filtered = products.filter(p => {
    const matchesSearch =
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Fuel className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Product Master Catalog
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Global repository of petroleum, gas, and retail fuel grades managed across IOCL retail networks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadProducts}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canWrite && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-lg text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, product name, or category..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-orange-500"
          >
            <option value="ALL">All Categories ({products.length})</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm font-mono flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
          Loading fuel products catalog...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center bg-slate-900/50 rounded-2xl border border-slate-800/80 p-8">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <div className="text-white font-bold text-sm">No products found</div>
          <div className="text-xs text-slate-400 mt-1">
            {search || categoryFilter !== 'ALL' ? 'Try adjusting your search criteria' : 'Create your first product master'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const isMS = p.category === 'MS' || p.category === 'XP95';
            const isHSD = p.category === 'HSD' || p.category === 'XTRAGREEN';
            const isCNG = p.category === 'CNG';

            const badgeBg = isMS
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : isHSD
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              : isCNG
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-purple-500/10 text-purple-400 border-purple-500/20';

            return (
              <div
                key={p.id}
                className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg shadow-black/20"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold tracking-wider bg-slate-800 text-orange-400 border border-slate-700">
                        {p.code}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}>
                        {p.category}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleStatus(p)}
                      disabled={!canWrite}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        p.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {p.status === 'ACTIVE' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 text-slate-500" />
                          <span>Inactive</span>
                        </>
                      )}
                    </button>
                  </div>

                  <h3 className="text-base font-bold text-white mt-3 line-clamp-1">
                    {p.name}
                  </h3>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] font-mono">MEASUREMENT UNIT</span>
                      <span className="text-slate-200 font-bold font-mono">{p.unit}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] font-mono">PRODUCT ID</span>
                      <span className="text-slate-400 font-mono text-[11px] truncate block" title={p.id}>
                        {p.id.slice(0, 12)}...
                      </span>
                    </div>
                  </div>
                </div>

                {canWrite && (
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-end">
                    <button
                      onClick={() => openEditModal(p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-700"
                    >
                      <Edit2 className="w-3 h-3 text-orange-400" />
                      <span>Edit Master</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Product Master Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">
              {editingProduct ? 'Edit Fuel Grade' : 'Register New Fuel Product'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              {editingProduct
                ? `Updating product details for ${editingProduct.code}`
                : 'Add a new master petroleum product to the national catalog'}
            </p>

            {modalError && (
              <div className="p-3 mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Product Code (Unique)
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingProduct)}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. MS, HSD, XP95, CNG"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-orange-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Motor Spirit (Petrol)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value.toUpperCase())}
                    placeholder="e.g. MS, HSD, CNG"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Measurement Unit
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as ProductUnit)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="LITRE">LITRE</option>
                    <option value="KG">KG</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50"
                >
                  {modalSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingProduct ? 'Save Changes' : 'Create Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { categoriesApi } from '@/lib/api/categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface Category {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  sortOrder: number;
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: '', slug: '', icon: '', description: '', sortOrder: 0 });
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', slug: '', icon: '', description: '', sortOrder: 0 });

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await categoriesApi.getAll();
      setCategories(res.data ?? []);
    } catch {
      toast.error('카테고리를 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleAdd = async () => {
    if (!newCategory.name || !newCategory.slug) {
      toast.error('이름과 슬러그를 입력해주세요');
      return;
    }
    try {
      await categoriesApi.create(newCategory);
      toast.success('카테고리가 추가되었습니다');
      setIsAdding(false);
      setNewCategory({ name: '', slug: '', icon: '', description: '', sortOrder: 0 });
      fetchCategories();
    } catch {
      toast.error('추가에 실패했습니다');
    }
  };

  const handleEdit = async (id: string) => {
    try {
      await categoriesApi.update(id, editValues);
      toast.success('카테고리가 수정되었습니다');
      setEditingId(null);
      fetchCategories();
    } catch {
      toast.error('수정에 실패했습니다');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await categoriesApi.delete(id);
      toast.success('카테고리가 삭제되었습니다');
      fetchCategories();
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat._id);
    setEditValues({
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon ?? '',
      description: cat.description ?? '',
      sortOrder: cat.sortOrder,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">카테고리관리</h1>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="size-4 mr-1" />
          추가
        </Button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-medium text-sm">새 카테고리</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input
              placeholder="이름"
              value={newCategory.name}
              onChange={(e) =>
                setNewCategory({ ...newCategory, name: e.target.value })
              }
            />
            <Input
              placeholder="슬러그"
              value={newCategory.slug}
              onChange={(e) =>
                setNewCategory({ ...newCategory, slug: e.target.value })
              }
            />
            <Input
              placeholder="아이콘 (이모지)"
              value={newCategory.icon}
              onChange={(e) =>
                setNewCategory({ ...newCategory, icon: e.target.value })
              }
            />
            <Input
              placeholder="정렬순서"
              type="number"
              value={newCategory.sortOrder}
              onChange={(e) =>
                setNewCategory({ ...newCategory, sortOrder: Number(e.target.value) })
              }
            />
          </div>
          <Input
            placeholder="설명"
            value={newCategory.description}
            onChange={(e) =>
              setNewCategory({ ...newCategory, description: e.target.value })
            }
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>
              <Save className="size-3.5 mr-1" />
              저장
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAdding(false)}
            >
              <X className="size-3.5 mr-1" />
              취소
            </Button>
          </div>
        </div>
      )}

      {/* Categories Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : categories.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">순서</th>
                  <th className="text-left px-4 py-3 font-medium">아이콘</th>
                  <th className="text-left px-4 py-3 font-medium">이름</th>
                  <th className="text-left px-4 py-3 font-medium">슬러그</th>
                  <th className="text-left px-4 py-3 font-medium">설명</th>
                  <th className="text-right px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat._id} className="border-t">
                    {editingId === cat._id ? (
                      <>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            className="w-16 h-8"
                            value={editValues.sortOrder}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                sortOrder: Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="w-16 h-8"
                            value={editValues.icon}
                            onChange={(e) =>
                              setEditValues({ ...editValues, icon: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="h-8"
                            value={editValues.name}
                            onChange={(e) =>
                              setEditValues({ ...editValues, name: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="h-8"
                            value={editValues.slug}
                            onChange={(e) =>
                              setEditValues({ ...editValues, slug: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="h-8"
                            value={editValues.description}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                description: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(cat._id)}
                            >
                              <Save className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-muted-foreground">
                          {cat.sortOrder}
                        </td>
                        <td className="px-4 py-3">{cat.icon}</td>
                        <td className="px-4 py-3 font-medium">{cat.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {cat.slug}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {cat.description}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(cat)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => handleDelete(cat._id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">카테고리가 없습니다</p>
        </div>
      )}
    </div>
  );
}

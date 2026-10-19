import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Listing, type SearchParams } from "@/components/listing/Listing";
import { api, findCategory } from "@/lib/api";
import type { CategoryNode } from "@/lib/types";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

function parentOf(nodes: CategoryNode[], slug: string, parent?: CategoryNode): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return parent;
    const hit = parentOf(node.children, slug, node);
    if (hit) return hit;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const category = findCategory(await api.categories(), slug);
  return category ? { title: category.name, description: category.description || undefined } : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const slug = decodeURIComponent((await params).slug);
  const tree = await api.categories();
  const category = findCategory(tree, slug);
  if (!category) notFound();
  const parent = parentOf(tree, slug);
  // A parent shows its children as chips; a child shows its siblings.
  const siblings = category.children.length ? category.children : parent?.children;

  return (
    <Listing
      title={category.name}
      latin={parent?.name}
      intro={category.description}
      category={category}
      siblings={siblings}
      searchParams={await searchParams}
      basePath={`/c/${category.slug}`}
    />
  );
}

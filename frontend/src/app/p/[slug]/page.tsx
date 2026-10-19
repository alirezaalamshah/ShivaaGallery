import type { Metadata } from "next";

import { ProductView } from "@/components/product/ProductView";
import { api } from "@/lib/api";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ color?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await api.product(decodeURIComponent((await params).slug));
  const image = product.images[0]?.image;
  return {
    title: product.name,
    description: product.description || `${product.name} از ${product.category.name}`,
    openGraph: { title: product.name, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [product, store] = await Promise.all([api.product(decodeURIComponent((await params).slug)), api.store()]);
  const color = Number((await searchParams).color) || undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.images.map((im) => im.image),
    category: product.category.name,
    brand: { "@type": "Brand", name: store.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "IRR",
      // Prices are stored in toman; schema.org expects rial.
      lowPrice: Math.min(...product.variants.map((v) => v.price), product.current_price) * 10,
      highPrice: Math.max(...product.variants.map((v) => v.price), product.current_price) * 10,
      availability: product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ProductView product={product} initialColor={color} />
    </div>
  );
}

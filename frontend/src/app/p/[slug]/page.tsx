import type { Metadata } from "next";

import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import { ProductReviews } from "@/components/product/ProductReviews";
import { ProductView, ProductViewFromUrl } from "@/components/product/ProductView";
import { api } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

// Each product page is built once and kept, then rebuilt at most once a minute (or right away
// when the panel saves a change), instead of on every visit. None are built ahead of time.
export const revalidate = 60;
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await api.product(decodeURIComponent((await params).slug));
  const image = product.images[0]?.image;
  return {
    title: product.name,
    description: product.description || `${product.name} از ${product.category.name}`,
    openGraph: { title: product.name, images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug);
  const [product, store, related] = await Promise.all([api.product(slug), api.store(), api.related(slug).catch(() => [])]);

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
      {/* ?color= is read in the browser, so the page itself can be kept ready for everyone. */}
      <Suspense fallback={<ProductView product={product} />}>
        <ProductViewFromUrl product={product} />
      </Suspense>
      <ProductReviews slug={product.slug} />
      {related.length > 0 && (
        <section className="sec" style={{ paddingInline: 0 }}>
          <div className="sec-head" data-reveal>
            <div>
              <span className="latin">You may also like</span>
              <h2>از همین دسته</h2>
            </div>
            <Link href={`/c/${product.category.slug}`} className="link-more">
              همه‌ی {product.category.name} <Icon name="arrow" />
            </Link>
          </div>
          <div className="grid" data-reveal-group>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

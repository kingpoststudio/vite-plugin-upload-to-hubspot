<script>
  import { onMount } from 'svelte';

  // ─── Configuration ────────────────────────────────────────────────────────
  // Replace these with your actual Algolia credentials.
  const ALGOLIA_APP_ID = import.meta.env.VITE_ALGOLIA_APP_ID ?? '';
  const ALGOLIA_SEARCH_KEY = import.meta.env.VITE_ALGOLIA_SEARCH_KEY ?? '';

  /**
   * A single Algolia index is used for ALL product listings.
   * Sorting is handled client-side by product property values,
   * so no replica indices are required.
   */
  const ALGOLIA_INDEX = import.meta.env.VITE_ALGOLIA_INDEX ?? 'products';

  // ─── State ────────────────────────────────────────────────────────────────
  /** @type {Record<string, unknown>[]} */
  let products = [];
  let loading = false;
  let error = '';
  let query = '';

  /**
   * The product property to sort by (e.g. 'price', 'name', 'createdAt').
   * An empty string means "use the default Algolia relevance order".
   * @type {string}
   */
  let sortKey = '';

  /** @type {'asc' | 'desc'} */
  let sortDirection = 'asc';

  // ─── Derived / Reactive ───────────────────────────────────────────────────
  /**
   * Sort the fetched products client-side based on a product property value.
   * No index-switching is required; the products array from the single index
   * is reordered in the browser.
   */
  $: sortedProducts = sortKey
    ? [...products].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          return sortDirection === 'asc' ? cmp : -cmp;
        }

        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDirection === 'asc' ? cmp : -cmp;
      })
    : products;

  // ─── Data fetching ────────────────────────────────────────────────────────
  /**
   * Search the single product index for the current query.
   * Called on mount and whenever the search query changes.
   */
  async function searchProducts() {
    if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_KEY) {
      error = 'Algolia credentials are not configured.';
      return;
    }

    loading = true;
    error = '';

    try {
      const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(ALGOLIA_INDEX)}/query`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP_ID,
          'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, hitsPerPage: 100 }),
      });

      if (!response.ok) {
        throw new Error(`Algolia responded with status ${response.status}`);
      }

      const data = await response.json();
      products = data.hits ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      products = [];
    } finally {
      loading = false;
    }
  }

  onMount(searchProducts);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Toggle sort direction when the same sort key is selected again;
   * otherwise switch to the new key with ascending order.
   * @param {string} key
   */
  function handleSortChange(key) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = 'asc';
    }
  }

  function clearSort() {
    sortKey = '';
    sortDirection = 'asc';
  }
</script>

<!-- ─── Markup ─────────────────────────────────────────────────────────── -->
<section class="product-listing">
  <div class="product-listing__controls">
    <!-- Search -->
    <input
      class="product-listing__search"
      type="search"
      placeholder="Search products…"
      bind:value={query}
      on:input={searchProducts}
      aria-label="Search products"
    />

    <!-- Sort controls -->
    <div class="product-listing__sort" role="group" aria-label="Sort products">
      <button
        class="product-listing__sort-btn"
        class:active={sortKey === 'name'}
        type="button"
        on:click={() => handleSortChange('name')}
      >
        Name
        {#if sortKey === 'name'}
          <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        {/if}
      </button>

      <button
        class="product-listing__sort-btn"
        class:active={sortKey === 'price'}
        type="button"
        on:click={() => handleSortChange('price')}
      >
        Price
        {#if sortKey === 'price'}
          <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        {/if}
      </button>

      {#if sortKey}
        <button
          class="product-listing__sort-clear"
          type="button"
          on:click={clearSort}
        >
          Clear sort
        </button>
      {/if}
    </div>
  </div>

  <!-- Status -->
  {#if loading}
    <p class="product-listing__status" aria-live="polite">Loading products…</p>
  {:else if error}
    <p class="product-listing__status product-listing__status--error" role="alert">
      {error}
    </p>
  {:else if sortedProducts.length === 0}
    <p class="product-listing__status" aria-live="polite">No products found.</p>
  {:else}
    <!-- Product grid -->
    <ul class="product-listing__grid">
      {#each sortedProducts as product (product.objectID)}
        <li class="product-listing__item">
          {#if product.image}
            <img
              class="product-listing__image"
              src={product.image}
              alt={product.name ?? 'Product image'}
              loading="lazy"
            />
          {/if}
          <h2 class="product-listing__name">{product.name ?? 'Unnamed product'}</h2>
          {#if product.price != null}
            <p class="product-listing__price">
              {typeof product.price === 'number'
                ? product.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                : product.price}
            </p>
          {/if}
          {#if product.description}
            <p class="product-listing__description">{product.description}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .product-listing__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .product-listing__search {
    flex: 1 1 200px;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .product-listing__sort {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .product-listing__sort-btn {
    padding: 0.4rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }

  .product-listing__sort-btn.active {
    border-color: #0073e6;
    color: #0073e6;
    font-weight: 600;
  }

  .product-listing__sort-clear {
    padding: 0.4rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
  }

  .product-listing__status {
    color: #555;
    text-align: center;
    padding: 2rem 0;
  }

  .product-listing__status--error {
    color: #c0392b;
  }

  .product-listing__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .product-listing__item {
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .product-listing__image {
    width: 100%;
    height: 200px;
    object-fit: cover;
    border-radius: 4px;
  }

  .product-listing__name {
    font-size: 1rem;
    margin: 0;
  }

  .product-listing__price {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
    color: #1a1a1a;
  }

  .product-listing__description {
    font-size: 0.875rem;
    color: #555;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>

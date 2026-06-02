<script>
  import { onMount } from 'svelte';

  // ─── Configuration ────────────────────────────────────────────────────────
  const ALGOLIA_APP_ID = import.meta.env.VITE_ALGOLIA_APP_ID ?? '';
  const ALGOLIA_SEARCH_KEY = import.meta.env.VITE_ALGOLIA_SEARCH_KEY ?? '';

  /**
   * A single Algolia index is used for ALL product listings.
   * Sorting is handled client-side, so no replica indices are required.
   */
  const ALGOLIA_INDEX = import.meta.env.VITE_ALGOLIA_INDEX ?? 'products';

  /** Maximum number of hits returned per Algolia query. */
  const HITS_PER_PAGE = 100;

  /** Delay (ms) between the last keystroke and the Algolia request. */
  const SEARCH_DEBOUNCE_MS = 300;

  // ─── Types ────────────────────────────────────────────────────────────────
  /**
   * @typedef {{ label: string; key: string }} SortOption
   * @typedef {{ asc: boolean; key: string }} SortState
   * @typedef {{
   *   objectID: string;
   *   name?: string;
   *   price?: number | string;
   *   image?: string;
   *   description?: string;
   *   [key: string]: unknown;
   * }} Product
   */

  // ─── Sort options ─────────────────────────────────────────────────────────
  /** @type {SortOption[]} */
  const SORT_OPTIONS = [
    { label: 'Name',  key: 'name'  },
    { label: 'Price', key: 'price' },
  ];

  // ─── State ────────────────────────────────────────────────────────────────
  /** @type {Product[]} */
  let products = [];
  let loading = false;
  let error = '';
  let query = '';

  /**
   * Unified sort state. `key === ''` means "use Algolia's default relevance order".
   * @type {SortState}
   */
  let sort = { key: '', asc: true };

  /** @type {ReturnType<typeof setTimeout> | null} */
  let debounceTimer = null;

  // ─── Derived / Reactive ───────────────────────────────────────────────────
  /**
   * Products sorted client-side by a product property value.
   * When `sort.key` is empty the original (Algolia-ranked) order is preserved.
   * @type {Product[]}
   */
  $: sortedProducts = sort.key
    ? [...products].sort((a, b) => {
        const aVal = a[sort.key];
        const bVal = b[sort.key];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sort.asc ? 1 : -1;
        if (bVal == null) return sort.asc ? -1 : 1;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          return sort.asc ? cmp : -cmp;
        }

        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.asc ? cmp : -cmp;
      })
    : products;

  // ─── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Format a price value as a USD currency string.
   * Falls back to the raw value if it isn't a number.
   * @param {number | string} price
   * @returns {string}
   */
  function formatPrice(price) {
    return typeof price === 'number'
      ? price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      : String(price);
  }

  /**
   * Toggle sort direction when the same key is clicked again;
   * otherwise switch to the new key with ascending order.
   * @param {string} key
   */
  function handleSortChange(key) {
    sort = sort.key === key
      ? { key, asc: !sort.asc }
      : { key, asc: true };
  }

  function clearSort() {
    sort = { key: '', asc: true };
  }

  // ─── Data fetching ────────────────────────────────────────────────────────
  /**
   * Send a search request to Algolia for the current query.
   * Debounced so rapid keystrokes do not flood the API.
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
        body: JSON.stringify({ query, hitsPerPage: HITS_PER_PAGE }),
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

  function handleSearchInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(searchProducts, SEARCH_DEBOUNCE_MS);
  }

  onMount(searchProducts);
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
      on:input={handleSearchInput}
      aria-label="Search products"
    />

    <!-- Sort controls -->
    <div class="product-listing__sort" role="group" aria-label="Sort products">
      {#each SORT_OPTIONS as option (option.key)}
        <button
          class="product-listing__sort-btn"
          class:active={sort.key === option.key}
          type="button"
          on:click={() => handleSortChange(option.key)}
        >
          {option.label}
          {#if sort.key === option.key}
            <span aria-hidden="true">{sort.asc ? '↑' : '↓'}</span>
          {/if}
        </button>
      {/each}

      {#if sort.key}
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
            <p class="product-listing__price">{formatPrice(product.price)}</p>
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

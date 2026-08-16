package com.ecommerce.backend.config;

import com.ecommerce.backend.common.Role;
import com.ecommerce.backend.common.util.Slugifier;
import com.ecommerce.backend.modules.catalog.Brand;
import com.ecommerce.backend.modules.catalog.BrandRepository;
import com.ecommerce.backend.modules.catalog.Category;
import com.ecommerce.backend.modules.catalog.CategoryRepository;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.catalog.ProductRepository;
import com.ecommerce.backend.modules.catalog.Variant;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import com.ecommerce.backend.security.PasswordHashing;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds demo catalog + accounts when the app runs in in-memory demo mode
 * ({@code USE_IN_MEMORY_DB=true}). The bundled MongoDB is wiped on every
 * restart, so this runs once per boot on an empty database. Idempotent: it
 * skips seeding when a users collection already exists.
 */
@Component
public class DemoDataSeeder implements CommandLineRunner {

    private final AppConfig config;
    private final UserRepository userRepository;
    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final ProductRepository productRepository;
    private final PasswordHashing passwordHashing;

    public DemoDataSeeder(
            AppConfig config,
            UserRepository userRepository,
            CategoryRepository categoryRepository,
            BrandRepository brandRepository,
            ProductRepository productRepository,
            PasswordHashing passwordHashing) {
        this.config = config;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.brandRepository = brandRepository;
        this.productRepository = productRepository;
        this.passwordHashing = passwordHashing;
    }

    @Override
    public void run(String... args) {
        if (!config.useInMemoryDb()) {
            return;
        }
        if (userRepository.count() > 0) {
            return;
        }
        Instant now = Instant.now();
        seedUsers(now);
        seedCatalog(now);
        System.out.println("[demo-seeder] seeded demo catalog + accounts");
    }

    private void seedUsers(Instant now) {
        User admin = new User();
        admin.name = "Demo Admin";
        admin.email = "admin@demo.com";
        admin.passwordHash = passwordHashing.hash("Admin123!");
        admin.roles = List.of(Role.ADMIN, Role.CUSTOMER);
        admin.status = User.STATUS_ACTIVE;
        admin.emailVerifiedAt = now;
        userRepository.save(admin);

        User customer = new User();
        customer.name = "Demo Customer";
        customer.email = "demo@demo.com";
        customer.passwordHash = passwordHashing.hash("Demo123!");
        customer.roles = List.of(Role.CUSTOMER);
        customer.status = User.STATUS_ACTIVE;
        customer.emailVerifiedAt = now;
        userRepository.save(customer);
    }

    private void seedCatalog(Instant now) {
        Map<String, Category> categories = new LinkedHashMap<>();
        List<String[]> categoryDefs = List.of(
                new String[] {"Electronics", "Gadgets, audio and smart devices"},
                new String[] {"Fashion", "Apparel and accessories"},
                new String[] {"Home & Kitchen", "Everyday essentials for the home"},
                new String[] {"Sports", "Gear for training and the outdoors"},
                new String[] {"Beauty", "Skincare and personal care"});
        for (String[] def : categoryDefs) {
            Category c = new Category();
            c.name = def[0];
            c.slug = Slugifier.slugify(def[0]);
            c.description = def[1];
            c.isActive = true;
            c.order = categories.size();
            c.createdAt = now;
            c.updatedAt = now;
            categories.put(def[0], categoryRepository.save(c));
        }

        Map<String, Brand> brands = new LinkedHashMap<>();
        for (String name : List.of("NovaTech", "Pulse", "Echo", "Luma", "Terra", "Atlas")) {
            Brand b = new Brand();
            b.name = name;
            b.slug = Slugifier.slugify(name);
            b.description = "Demo brand";
            b.isActive = true;
            b.createdAt = now;
            b.updatedAt = now;
            brands.put(name, brandRepository.save(b));
        }

        List<ProductDef> defs = List.of(
                new ProductDef("Aurora Wireless Headphones", "Electronics", "NovaTech",
                        "Over-ear headphones with active noise cancellation and 40h battery.",
                        List.of("audio", "wireless", "headphones"),
                        List.of(32999, 39999), null),
                new ProductDef("Pulse Smart Watch Pro", "Electronics", "Pulse",
                        "AMOLED display, GPS, heart-rate and sleep tracking.",
                        List.of("wearables", "smart", "fitness"),
                        List.of(24900, 25900), null),
                new ProductDef("Nova Soundbar 2.1", "Electronics", "NovaTech",
                        "Dolby Atmos soundbar with wireless subwoofer.",
                        List.of("audio", "home-theater", "soundbar"),
                        List.of(19950), null),
                new ProductDef("Echo Portable Speaker", "Electronics", "Echo",
                        "IPX7 waterproof, 20h playtime, pairs in stereo.",
                        List.of("audio", "bluetooth", "portable"),
                        List.of(5999), 7999L),
                new ProductDef("Luma LED Desk Lamp", "Electronics", "Luma",
                        "Dimmable daylight lamp with USB charging port.",
                        List.of("lighting", "desk", "smart"),
                        List.of(3499), null),
                new ProductDef("Terra 4K Action Camera", "Electronics", "Terra",
                        "Waterproof to 30m, 4K60, electronic image stabilisation.",
                        List.of("camera", "action", "outdoors"),
                        List.of(18900, 21900), null),
                new ProductDef("Classic Denim Jacket", "Fashion", "Atlas",
                        "Mid-weight cotton denim jacket with a tailored fit.",
                        List.of("jacket", "denim", "men"),
                        List.of(7900), 9900L),
                new ProductDef("Merino Wool Scarf", "Fashion", "Atlas",
                        "Soft, breathable merino scarf in a minimalist design.",
                        List.of("scarf", "wool", "winter"),
                        List.of(4250), null),
                new ProductDef("Everyday Cotton Tee 3-Pack", "Fashion", "Pulse",
                        "Three classic crew-neck tees in organic cotton.",
                        List.of("t-shirt", "basics", "cotton"),
                        List.of(2999), null),
                new ProductDef("Leather Crossbody Bag", "Fashion", "Luma",
                        "Full-grain leather bag with an adjustable strap.",
                        List.of("bag", "leather", "accessories"),
                        List.of(9500, 10500), null),
                new ProductDef("Cast Iron Skillet 12\"", "Home & Kitchen", "Terra",
                        "Pre-seasoned cast iron skillet, oven-safe to 260°C.",
                        List.of("cookware", "kitchen", "skillet"),
                        List.of(4999), null),
                new ProductDef("Ceramic Pour-Over Set", "Home & Kitchen", "Echo",
                        "Hand-glazed dripper and carafe for a slow coffee ritual.",
                        List.of("coffee", "kitchen", "ceramic"),
                        List.of(3800), null),
                new ProductDef("Bamboo Cutting Board Set", "Home & Kitchen", "Terra",
                        "Three-bamboo board set with juice grooves and feet.",
                        List.of("kitchen", "bamboo", "boards"),
                        List.of(4400), null),
                new ProductDef("Trail Running Shoes", "Sports", "Atlas",
                        "Grippy all-terrain trainers with responsive foam.",
                        List.of("running", "shoes", "trail"),
                        List.of(11900, 12900), 14900L),
                new ProductDef("Yoga Mat Pro", "Sports", "Pulse",
                        "Non-slip 6mm mat with alignment lines and carry strap.",
                        List.of("yoga", "fitness", "mat"),
                        List.of(3500), null),
                new ProductDef("Insulated Water Bottle", "Sports", "Terra",
                        "Vacuum-insulated 750ml bottle, keeps drinks cold 24h.",
                        List.of("bottle", "hydration", "outdoors"),
                        List.of(2499), null),
                new ProductDef("Vitamin C Serum", "Beauty", "Luma",
                        "15% vitamin C brightening serum with hyaluronic acid.",
                        List.of("skincare", "serum", "vitamin-c"),
                        List.of(2800), null),
                new ProductDef("Hydrating Face Cream", "Beauty", "Luma",
                        "Ceramide-rich daily moisturiser for all skin types.",
                        List.of("skincare", "moisturizer", "face"),
                        List.of(2250), null));

        for (ProductDef def : defs) {
            Product p = new Product();
            p.name = def.name();
            p.slug = Slugifier.slugify(def.name());
            p.summary = def.description();
            p.description = def.description()
                    + "\n\nDemo catalogue item seeded for the in-memory demo database.";
            p.brand = def.brand();
            p.category = def.category();
            p.images = imageList(def.name(), 2);
            p.specs = List.of(
                    spec("Material", "Premium quality"),
                    spec("Warranty", "12 months"));
            p.tags = def.tags();
            p.status = Product.STATUS_PUBLISHED;
            p.isActive = true;
            p.publishedAt = now;
            p.createdAt = now;
            p.updatedAt = now;
            p.variants = variants(def, now);
            productRepository.save(p);
        }
    }

    private List<Variant> variants(ProductDef def, Instant now) {
        List<Variant> out = new ArrayList<>();
        long base = def.prices().get(0);
        long compareAt = def.compareAt() != null ? def.compareAt() : Math.round(base * 1.2);
        int idx = 0;
        for (long price : def.prices()) {
            Variant v = new Variant();
            v.id = new org.bson.types.ObjectId().toHexString();
            v.sku = def.name().toUpperCase().replaceAll("[^A-Z0-9]", "").substring(0, Math.min(6, def.name().length()))
                    + "-" + (1000 + idx);
            v.attributes = new LinkedHashMap<>();
            v.attributes.put("Bundle", def.prices().size() == 1 ? "Standard" : "Option " + (idx + 1));
            v.priceCents = price;
            v.compareAtPriceCents = price < compareAt ? compareAt : null;
            v.taxRate = 8;
            v.stock.quantity = 25 + idx * 5;
            v.stock.available = v.stock.quantity;
            v.stock.reserved = 0;
            v.stock.lowStockThreshold = 5;
            v.images = List.of(image(def.name(), idx));
            v.isActive = true;
            out.add(v);
            idx++;
        }
        return out;
    }

    private static List<String> imageList(String seed, int count) {
        List<String> urls = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            urls.add(image(seed, i));
        }
        return urls;
    }

    private static String image(String seed, int i) {
        return "https://picsum.photos/seed/" + Slugifier.slugify(seed) + "-" + i + "/640/640";
    }

    private static Product.Spec spec(String key, String value) {
        Product.Spec s = new Product.Spec();
        s.key = key;
        s.value = value;
        return s;
    }

    private record ProductDef(
            String name,
            String category,
            String brand,
            String description,
            List<String> tags,
            List<Integer> prices,
            Long compareAt) {}
}

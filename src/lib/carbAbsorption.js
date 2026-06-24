export const FOOD_CATEGORIES = ["Fast Absorbing", "Medium Absorbing", "Slow Absorbing"];

export const ABSORPTION_PROFILES = {
  fast: {
    onsetMin: 5,
    peakMin: 30,
    durationMin: 90,
    riseExponent: 0.4,
    taperExponent: 0.65,
  },
  medium: {
    onsetMin: 15,
    peakMin: 65,
    durationMin: 150,
    riseExponent: 0.5,
    taperExponent: 0.6,
  },
  slow: {
    onsetMin: 25,
    peakMin: 120,
    durationMin: 300,
    riseExponent: 0.6,
    taperExponent: 0.5,
  },
};


export const ABSORPTION_PROFILES = {
  fast:   { onsetMin: 5,  peakMin: 30,  durationMin: 90  },
  medium: { onsetMin: 15, peakMin: 65,  durationMin: 150 },
  slow:   { onsetMin: 25, peakMin: 120, durationMin: 300 },
};

export const PROFILE_COLORS = {
  fast:   "#ef4444",
  medium: "#f59e0b",
  slow:   "#a78bfa",
};

export const FOOD_DATABASE = [
  // ── Fast Absorbing ──────────────────────────────────────────────────────────
  { name: "White Bread",          carbs: 15, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Candy",                carbs: 25, gi: 80,  category: "Fast Absorbing", profile: "fast" },
  { name: "Apple Juice",          carbs: 30, gi: 44,  category: "Fast Absorbing", profile: "fast" },
  { name: "Regular Soda",         carbs: 39, gi: 65,  category: "Fast Absorbing", profile: "fast" },
  { name: "Glucose Tablets",      carbs:  4, gi: 100, category: "Fast Absorbing", profile: "fast" },
  { name: "White Rice",           carbs: 45, gi: 73,  category: "Fast Absorbing", profile: "fast" },
  { name: "Sports Drink",         carbs: 21, gi: 78,  category: "Fast Absorbing", profile: "fast" },
  { name: "Plain White Bagel",    carbs: 48, gi: 72,  category: "Fast Absorbing", profile: "fast" },
  { name: "French Fries",         carbs: 45, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Baked Potato",         carbs: 37, gi: 85,  category: "Fast Absorbing", profile: "fast" },
  { name: "Mashed Potatoes",      carbs: 30, gi: 82,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cornflakes",           carbs: 26, gi: 81,  category: "Fast Absorbing", profile: "fast" },
  { name: "Pretzels",             carbs: 23, gi: 83,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Cakes",           carbs: 14, gi: 82,  category: "Fast Absorbing", profile: "fast" },
  { name: "Watermelon",           carbs: 11, gi: 72,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Krispies",        carbs: 26, gi: 82,  category: "Fast Absorbing", profile: "fast" },
  { name: "Glazed Doughnut",      carbs: 25, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Waffles",              carbs: 15, gi: 76,  category: "Fast Absorbing", profile: "fast" },
  { name: "Jelly Beans",          carbs: 10, gi: 80,  category: "Fast Absorbing", profile: "fast" },
  { name: "Instant Oatmeal",      carbs: 20, gi: 79,  category: "Fast Absorbing", profile: "fast" },
  { name: "Saltine Crackers",     carbs: 11, gi: 74,  category: "Fast Absorbing", profile: "fast" },
  { name: "Graham Crackers",      carbs: 11, gi: 74,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cheerios",             carbs: 20, gi: 74,  category: "Fast Absorbing", profile: "fast" },
  { name: "Gummy Bears",          carbs: 22, gi: 78,  category: "Fast Absorbing", profile: "fast" },
  { name: "Millet",               carbs: 41, gi: 71,  category: "Fast Absorbing", profile: "fast" },
  { name: "Plain Scone",          carbs: 40, gi: 92,  category: "Fast Absorbing", profile: "fast" },
  { name: "Baguette",             carbs: 18, gi: 95,  category: "Fast Absorbing", profile: "fast" },
  { name: "Corn Chips",           carbs: 15, gi: 72,  category: "Fast Absorbing", profile: "fast" },
  { name: "Potato Chips",         carbs: 15, gi: 56,  category: "Fast Absorbing", profile: "fast" },
  { name: "Polenta",              carbs: 32, gi: 70,  category: "Fast Absorbing", profile: "fast" },
  { name: "Gnocchi",              carbs: 32, gi: 70,  category: "Fast Absorbing", profile: "fast" },
  { name: "Boiled Parsnips",      carbs: 13, gi: 85,  category: "Fast Absorbing", profile: "fast" },
  { name: "Boiled Pumpkin",       carbs:  5, gi: 75,  category: "Fast Absorbing", profile: "fast" },
  { name: "Dried Dates",          carbs: 36, gi: 103, category: "Fast Absorbing", profile: "fast" },
  { name: "Croissant",            carbs: 26, gi: 67,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Milk",            carbs: 22, gi: 86,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cotton Candy",         carbs: 25, gi: 100, category: "Fast Absorbing", profile: "fast" },
  { name: "Honey",                carbs: 17, gi: 61,  category: "Fast Absorbing", profile: "fast" },
  { name: "Table Sugar",          carbs: 13, gi: 65,  category: "Fast Absorbing", profile: "fast" },
  { name: "Maple Syrup",          carbs: 13, gi: 54,  category: "Fast Absorbing", profile: "fast" },
  { name: "White Pita Bread",     carbs: 33, gi: 57,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Vermicelli",      carbs: 44, gi: 58,  category: "Fast Absorbing", profile: "fast" },
  { name: "Grape Juice",          carbs: 38, gi: 54,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cranberry Juice",      carbs: 31, gi: 52,  category: "Fast Absorbing", profile: "fast" },
  { name: "Pineapple Juice",      carbs: 32, gi: 46,  category: "Fast Absorbing", profile: "fast" },
  { name: "Orange Juice",         carbs: 26, gi: 50,  category: "Fast Absorbing", profile: "fast" },
  { name: "Rice Pudding",         carbs: 29, gi: 69,  category: "Fast Absorbing", profile: "fast" },
  { name: "Pancakes",             carbs: 30, gi: 66,  category: "Fast Absorbing", profile: "fast" },
  { name: "French Toast",         carbs: 22, gi: 68,  category: "Fast Absorbing", profile: "fast" },
  { name: "Cheese Crackers",      carbs: 18, gi: 70,  category: "Fast Absorbing", profile: "fast" },
//Breakfast & Bakery
{ name: "Cinnamon Roll with Icing", carbs: 48, gi: 74, category: "Fast Absorbing", profile: "fast" },
{ name: "Corn Muffin", carbs: 34, gi: 70, category: "Fast Absorbing", profile: "fast" },
{ name: "Frosted Flakes Cereal", carbs: 26, gi: 80, category: "Fast Absorbing", profile: "fast" },
{ name: "White Toast with Strawberry Jam", carbs: 28, gi: 75, category: "Fast Absorbing", profile: "fast" },
{ name: "Blueberry Pancake with Syrup", carbs: 45, gi: 72, category: "Fast Absorbing", profile: "fast" },
{ name: "Toaster Strudel", carbs: 26, gi: 73, category: "Fast Absorbing", profile: "fast" },
{ name: "Rice Krispies Treat", carbs: 22, gi: 82, category: "Fast Absorbing", profile: "fast" },

// Drinks & Juices
{ name: "Gatorade / Sports Drink", carbs: 21, gi: 78, category: "Fast Absorbing", profile: "fast" },
{ name: "Red Bull / Energy Drink", carbs: 27, gi: 70, category: "Fast Absorbing", profile: "fast" },
{ name: "Sweetened Iced Coffee", carbs: 24, gi: 68, category: "Fast Absorbing", profile: "fast" },
{ name: "Sweet Tea", carbs: 22, gi: 72, category: "Fast Absorbing", profile: "fast" },
{ name: "Apple Cider", carbs: 28, gi: 65, category: "Fast Absorbing", profile: "fast" },
{ name: "Fruit Punch", carbs: 28, gi: 72, category: "Fast Absorbing", profile: "fast" },
{ name: "Lemonade", carbs: 26, gi: 72, category: "Fast Absorbing", profile: "fast" },
{ name: "Bubble Tea (with Tapioca)", carbs: 54, gi: 70, category: "Fast Absorbing", profile: "fast" },

// Sweet Treats & Snacks
{ name: "Skittles", carbs: 22, gi: 85, category: "Fast Absorbing", profile: "fast" },
{ name: "Fruit Snacks / Fruit Leather", carbs: 18, gi: 78, category: "Fast Absorbing", profile: "fast" },
{ name: "Vanilla Ice Cream Cone", carbs: 25, gi: 68, category: "Fast Absorbing", profile: "fast" },
{ name: "Sugar Cookie", carbs: 15, gi: 70, category: "Fast Absorbing", profile: "fast" },
{ name: "Marshmallows", carbs: 24, gi: 80, category: "Fast Absorbing", profile: "fast" },
{ name: "Pop-Tarts", carbs: 38, gi: 75, category: "Fast Absorbing", profile: "fast" },
{ name: "Pineapple Chunks", carbs: 16, gi: 66, category: "Fast Absorbing", profile: "fast" },
{ name: "Gummy Worms", carbs: 22, gi: 78, category: "Fast Absorbing", profile: "fast" },
{ name: "Orange Sherbet", carbs: 29, gi: 65, category: "Fast Absorbing", profile: "fast" },
{ name: "Animal Crackers", carbs: 22, gi: 70, category: "Fast Absorbing", profile: "fast" },
{ name: "Caramel Corn", carbs: 22, gi: 75, category: "Fast Absorbing", profile: "fast" },
{ name: "Vanilla Wafers", carbs: 12, gi: 71, category: "Fast Absorbing", profile: "fast" },
{ name: "Pretzels", carbs: 23, gi: 83, category: "Fast Absorbing", profile: "fast" },
{ name: "Graham Crackers", carbs: 11, gi: 74, category: "Fast Absorbing", profile: "fast" },
{ name: "Cheese Crackers (e.g., Goldfish)", carbs: 15, gi: 70, category: "Fast Absorbing", profile: "fast" },




  // ── Medium Absorbing ────────────────────────────────────────────────────────
  { name: "Oatmeal",              carbs: 27, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Banana",               carbs: 27, gi: 51,  category: "Medium Absorbing", profile: "medium" },
  { name: "Brown Rice",           carbs: 45, gi: 50,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Potato",        carbs: 30, gi: 78,  category: "Medium Absorbing", profile: "medium" },
  { name: "Whole Wheat Bread",    carbs: 15, gi: 50,  category: "Medium Absorbing", profile: "medium" },
  { name: "Corn",                 carbs: 25, gi: 52,  category: "Medium Absorbing", profile: "medium" },
  { name: "Apple",                carbs: 25, gi: 36,  category: "Medium Absorbing", profile: "medium" },
  { name: "Orange",               carbs: 21, gi: 43,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sweet Potato",         carbs: 24, gi: 63,  category: "Medium Absorbing", profile: "medium" },
  { name: "Rolled Oats",          carbs: 27, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sweet Corn",           carbs: 16, gi: 56,  category: "Medium Absorbing", profile: "medium" },
  { name: "Basmati Rice",         carbs: 44, gi: 58,  category: "Medium Absorbing", profile: "medium" },
  { name: "Wild Rice",            carbs: 35, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Couscous",             carbs: 36, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Quinoa",               carbs: 39, gi: 53,  category: "Medium Absorbing", profile: "medium" },
  { name: "Buckwheat",            carbs: 33, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Rye Bread",            carbs: 15, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sourdough Bread",      carbs: 15, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Bran Flakes",          carbs: 24, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Shredded Wheat",       carbs: 40, gi: 67,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Pineapple",      carbs: 22, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Mango",          carbs: 25, gi: 51,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Papaya",         carbs: 14, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Cantaloupe",           carbs: 13, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Raisins",              carbs: 31, gi: 64,  category: "Medium Absorbing", profile: "medium" },
  { name: "Dried Figs",           carbs: 26, gi: 61,  category: "Medium Absorbing", profile: "medium" },
  { name: "Prunes",               carbs: 26, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Beets",         carbs:  8, gi: 64,  category: "Medium Absorbing", profile: "medium" },
  { name: "Green Peas",           carbs: 11, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Flour Tortilla",       carbs: 24, gi: 60,  category: "Medium Absorbing", profile: "medium" },
  { name: "Taco Shell",           carbs: 16, gi: 68,  category: "Medium Absorbing", profile: "medium" },
  { name: "Cornbread",            carbs: 28, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Granola Bar",          carbs: 20, gi: 61,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled New Potatoes",  carbs: 20, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Boiled Yam",           carbs: 20, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Oatmeal Cookie",       carbs: 15, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Blueberry Muffin",     carbs: 27, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Whole Wheat Pita",     carbs: 32, gi: 52,  category: "Medium Absorbing", profile: "medium" },
  { name: "Grapes",               carbs: 27, gi: 59,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Peach",          carbs: 14, gi: 42,  category: "Medium Absorbing", profile: "medium" },
  { name: "Kiwi",                 carbs: 11, gi: 53,  category: "Medium Absorbing", profile: "medium" },
  { name: "Fresh Apricot",        carbs:  8, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Tortilla Chips",       carbs: 18, gi: 63,  category: "Medium Absorbing", profile: "medium" },
  { name: "Air-Popped Popcorn",   carbs: 18, gi: 55,  category: "Medium Absorbing", profile: "medium" },
  { name: "Vanilla Ice Cream",    carbs: 16, gi: 57,  category: "Medium Absorbing", profile: "medium" },
  { name: "Custard",              carbs: 20, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Sweetened Fruit Yogurt", carbs: 26, gi: 60, category: "Medium Absorbing", profile: "medium" },
  { name: "Tomato Soup",          carbs: 16, gi: 54,  category: "Medium Absorbing", profile: "medium" },
  { name: "Thick Pizza Crust",    carbs: 30, gi: 65,  category: "Medium Absorbing", profile: "medium" },
  { name: "Split Pea Soup",       carbs: 26, gi: 60,  category: "Medium Absorbing", profile: "medium" },
//Takeout & Diner Favorites
{ name: "Chicken Fried Rice", carbs: 42, gi: 62, category: "Medium Absorbing", profile: "medium" },
{ name: "Chicken Tacos (Corn Tortilla)", carbs: 22, gi: 52, category: "Medium Absorbing", profile: "medium" },
{ name: "Sushi California Roll", carbs: 38, gi: 65, category: "Medium Absorbing", profile: "medium" },
{ name: "Turkey Sub Sandwich", carbs: 45, gi: 56, category: "Medium Absorbing", profile: "medium" },
{ name: "Teriyaki Chicken with White Rice", carbs: 48, gi: 63, category: "Medium Absorbing", profile: "medium" },
{ name: "Veggie Fried Rice", carbs: 40, gi: 60, category: "Medium Absorbing", profile: "medium" },

// Home-Cooked Mains & Soups
{ name: "Spaghetti with Meat Sauce", carbs: 40, gi: 52, category: "Medium Absorbing", profile: "medium" },
{ name: "Ham & Swiss Cheese Sandwich", carbs: 28, gi: 50, category: "Medium Absorbing", profile: "medium" },
{ name: "Salmon with Quinoa & Asparagus", carbs: 22, gi: 48, category: "Medium Absorbing", profile: "medium" },
{ name: "Chicken Noodle Soup", carbs: 18, gi: 50, category: "Medium Absorbing", profile: "medium" },
{ name: "New England Clam Chowder", carbs: 24, gi: 55, category: "Medium Absorbing", profile: "medium" },
{ name: "Turkey Burger on Wheat Bun", carbs: 26, gi: 51, category: "Medium Absorbing", profile: "medium" },
{ name: "Corn Chowder", carbs: 26, gi: 60, category: "Medium Absorbing", profile: "medium" },
{ name: "Black Bean Soup", carbs: 22, gi: 45, category: "Medium Absorbing", profile: "medium" },
{ name: "Beef Stew", carbs: 20, gi: 50, category: "Medium Absorbing", profile: "medium" },
{ name: "Minestrone Soup", carbs: 18, gi: 46, category: "Medium Absorbing", profile: "medium" },
{ name: "Shrimp Scampi with Pasta", carbs: 38, gi: 50, category: "Medium Absorbing", profile: "medium" },
{ name: "Chili Con Carne", carbs: 22, gi: 48, category: "Medium Absorbing", profile: "medium" },

// Sides & Snacks
{ name: "Hummus with Pita Bread", carbs: 25, gi: 48, category: "Medium Absorbing", profile: "medium" },
{ name: "Apple Slices with Peanut Butter", carbs: 18, gi: 38, category: "Medium Absorbing", profile: "medium" },
{ name: "Bran Muffin", carbs: 28, gi: 55, category: "Medium Absorbing", profile: "medium" },
{ name: "Popcorn (Butter & Salt)", carbs: 15, gi: 55, category: "Medium Absorbing", profile: "medium" },
{ name: "Baked Potato with Butter", carbs: 37, gi: 62, category: "Medium Absorbing", profile: "medium" },
{ name: "Whole Wheat Bagel (Plain)", carbs: 48, gi: 54, category: "Medium Absorbing", profile: "medium" },
{ name: "Chicken Caesar Wrap", carbs: 32, gi: 50, category: "Medium Absorbing", profile: "medium" },
{ name: "Oat Bran Cereal", carbs: 22, gi: 55, category: "Medium Absorbing", profile: "medium" },
{ name: "Fresh Banana", carbs: 27, gi: 51, category: "Medium Absorbing", profile: "medium" },
{ name: "Sweet Potato Fries", carbs: 30, gi: 58, category: "Medium Absorbing", profile: "medium" },
{ name: "Oatmeal Raisin Cookie", carbs: 18, gi: 55, category: "Medium Absorbing", profile: "medium" },
{ name: "Potato Salad", carbs: 24, gi: 58, category: "Medium Absorbing", profile: "medium" },
{ name: "Coleslaw", carbs: 12, gi: 45, category: "Medium Absorbing", profile: "medium" },
{ name: "Glazed Carrots", carbs: 14, gi: 50, category: "Medium Absorbing", profile: "medium" },
{ name: "Mango Slices", carbs: 22, gi: 51, category: "Medium Absorbing", profile: "medium" },
{ name: "Whole Wheat Crackers", carbs: 18, gi: 49, category: "Medium Absorbing", profile: "medium" },
{ name: "Yogurt Parfait (with Granola)", carbs: 28, gi: 50, category: "Medium Absorbing", profile: "medium" },



  // ── Slow Absorbing ──────────────────────────────────────────────────────────
  { name: "Pizza",                carbs: 35, gi: 45,  category: "Slow Absorbing", profile: "slow" },
  { name: "Pasta",                carbs: 40, gi: 50,  category: "Slow Absorbing", profile: "slow" },
  { name: "Whole Wheat Pasta",    carbs: 37, gi: 42,  category: "Slow Absorbing", profile: "slow" },
  { name: "Black Beans",          carbs: 20, gi: 30,  category: "Slow Absorbing", profile: "slow" },
  { name: "Lentils",              carbs: 20, gi: 32,  category: "Slow Absorbing", profile: "slow" },
  { name: "Ice Cream",            carbs: 28, gi: 51,  category: "Slow Absorbing", profile: "slow" },
  { name: "Mixed Meal",           carbs: 50, gi: 38,  category: "Slow Absorbing", profile: "slow" },
  { name: "Fresh Apple",          carbs: 25, gi: 36,  category: "Slow Absorbing", profile: "slow" },
  { name: "Fresh Pear",           carbs: 27, gi: 38,  category: "Slow Absorbing", profile: "slow" },
  { name: "Strawberries",         carbs: 11, gi: 40,  category: "Slow Absorbing", profile: "slow" },
  { name: "Blueberries",          carbs: 21, gi: 53,  category: "Slow Absorbing", profile: "slow" },
  { name: "Raspberries",          carbs: 15, gi: 32,  category: "Slow Absorbing", profile: "slow" },
  { name: "Grapefruit",           carbs: 13, gi: 25,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cherries",             carbs: 22, gi: 22,  category: "Slow Absorbing", profile: "slow" },
  { name: "Plums",                carbs: 15, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Chickpeas",            carbs: 22, gi: 28,  category: "Slow Absorbing", profile: "slow" },
  { name: "Kidney Beans",         carbs: 20, gi: 24,  category: "Slow Absorbing", profile: "slow" },
  { name: "Pinto Beans",          carbs: 22, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Lima Beans",           carbs: 16, gi: 46,  category: "Slow Absorbing", profile: "slow" },
  { name: "Edamame",              carbs:  7, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Green Beans",          carbs:  7, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Steamed Broccoli",     carbs:  6, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Steamed Cauliflower",  carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Boiled Carrots",       carbs:  6, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Barley",               carbs: 44, gi: 28,  category: "Slow Absorbing", profile: "slow" },
  { name: "White Pasta al dente", carbs: 40, gi: 43,  category: "Slow Absorbing", profile: "slow" },
  { name: "Whole Milk",           carbs: 12, gi: 39,  category: "Slow Absorbing", profile: "slow" },
  { name: "Skim Milk",            carbs: 12, gi: 37,  category: "Slow Absorbing", profile: "slow" },
  { name: "Plain Yogurt",         carbs:  8, gi: 14,  category: "Slow Absorbing", profile: "slow" },
  { name: "Soy Milk",             carbs:  8, gi: 34,  category: "Slow Absorbing", profile: "slow" },
  { name: "Almond Milk",          carbs:  1, gi: 25,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cashew Nuts",          carbs:  9, gi: 25,  category: "Slow Absorbing", profile: "slow" },
  { name: "Peanuts",              carbs:  5, gi: 14,  category: "Slow Absorbing", profile: "slow" },
  { name: "Walnuts",              carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Almonds",              carbs:  6, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Pistachios",           carbs:  8, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Hummus",               carbs:  4, gi:  6,  category: "Slow Absorbing", profile: "slow" },
  { name: "Avocado",              carbs: 12, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cooked Spinach",       carbs:  7, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Sautéed Mushrooms",    carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Roasted Brussels Sprouts", carbs: 11, gi: 15, category: "Slow Absorbing", profile: "slow" },
  { name: "Grilled Zucchini",     carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Roasted Asparagus",    carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Shredded Cabbage",     carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Celery",               carbs:  1, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cucumber",             carbs:  4, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Cooked Eggplant",      carbs:  9, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Raw Tomato",           carbs:  5, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Chia Seeds",           carbs: 10, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Dark Chocolate 85%",   carbs: 10, gi: 20,  category: "Slow Absorbing", profile: "slow" },
  { name: "Firm Tofu",            carbs:  2, gi: 15,  category: "Slow Absorbing", profile: "slow" },
  { name: "Quinoa Vegetable Salad", carbs: 25, gi: 35, category: "Slow Absorbing", profile: "slow" },
  //Heavy Takeout & Restaurant Favorites
{ name: "Pepperoni Pizza", carbs: 32, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Fettuccine Alfredo", carbs: 42, gi: 40, category: "Slow Absorbing", profile: "slow" },
{ name: "Beef Burrito (with Beans & Cheese)", carbs: 48, gi: 42, category: "Slow Absorbing", profile: "slow" },
{ name: "Fried Chicken (with skin/breading)", carbs: 12, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Beef Stroganoff", carbs: 35, gi: 43, category: "Slow Absorbing", profile: "slow" },
{ name: "Chicken Parmesan (with Pasta)", carbs: 38, gi: 44, category: "Slow Absorbing", profile: "slow" },
{ name: "Macaroni and Cheese", carbs: 40, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Chicken Quesadilla", carbs: 32, gi: 50, category: "Slow Absorbing", profile: "slow" },
{ name: "Cheeseburger", carbs: 35, gi: 48, category: "Slow Absorbing", profile: "slow" },
{ name: "Beef Lasagna", carbs: 35, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Falafel Wrap with Tahini", carbs: 35, gi: 44, category: "Slow Absorbing", profile: "slow" },
{ name: "Beef Enchiladas", carbs: 30, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Chicken Tikka Masala with Naan", carbs: 45, gi: 48, category: "Slow Absorbing", profile: "slow" },
{ name: "Pad Thai with Chicken & Peanuts", carbs: 55, gi: 49, category: "Slow Absorbing", profile: "slow" },
{ name: "Pork Dumplings / Potstickers", carbs: 24, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Beef Nachos with Cheese & Guac", carbs: 38, gi: 46, category: "Slow Absorbing", profile: "slow" },
{ name: "Fish and Chips", carbs: 42, gi: 49, category: "Slow Absorbing", profile: "slow" },
{ name: "Buffalo Wings (Breaded & Sauced)", carbs: 14, gi: 44, category: "Slow Absorbing", profile: "slow" },

// Classic Comfort Dinners & Breakfasts
{ name: "Peanut Butter & Jelly Sandwich", carbs: 30, gi: 48, category: "Slow Absorbing", profile: "slow" },
{ name: "Greek Yogurt with Walnuts", carbs: 12, gi: 25, category: "Slow Absorbing", profile: "slow" },
{ name: "Grilled Cheese Sandwich", carbs: 28, gi: 46, category: "Slow Absorbing", profile: "slow" },
{ name: "Avocado Toast on Sourdough", carbs: 18, gi: 40, category: "Slow Absorbing", profile: "slow" },
{ name: "Beef Chili with Beans", carbs: 25, gi: 30, category: "Slow Absorbing", profile: "slow" },
{ name: "Sausage & Egg Biscuit", carbs: 26, gi: 48, category: "Slow Absorbing", profile: "slow" },
{ name: "Meatloaf with Gravy", carbs: 15, gi: 45, category: "Slow Absorbing", profile: "slow" },
{ name: "Pulled Pork Sandwich", carbs: 38, gi: 49, category: "Slow Absorbing", profile: "slow" },
{ name: "Tuna Salad Sandwich on Rye", carbs: 28, gi: 44, category: "Slow Absorbing", profile: "slow" },
{ name: "Eggs Benedict", carbs: 24, gi: 46, category: "Slow Absorbing", profile: "slow" },
{ name: "Quiche Lorraine", carbs: 18, gi: 40, category: "Slow Absorbing", profile: "slow" },
{ name: "Steak with Mashed Potatoes & Butter", carbs: 28, gi: 48, category: "Slow Absorbing", profile: "slow" },
{ name: "Chicken Pot Pie", carbs: 34, gi: 48, category: "Slow Absorbing", profile: "slow" },
{ name: "Baked Salmon with Cream Sauce", carbs: 5, gi: 15, category: "Slow Absorbing", profile: "slow" },
{ name: "French Dip Sandwich with Au Jus", carbs: 32, gi: 46, category: "Slow Absorbing", profile: "slow" },
//Party Platter / Appetizers
{ name: "Spinach & Artichoke Dip with Chips", carbs: 24, gi: 42, category: "Slow Absorbing", profile: "slow" },
{ name: "Cobb Salad with Blue Cheese Dressing", carbs: 8, gi: 25, category: "Slow Absorbing", profile: "slow" }

];

export function getCarbAbsorptionAt(entry, targetTime = Date.now()) {
  if (entry.is_custom || !entry.absorption_profile) {
    return { absorbedGrams: 0, remainingGrams: 0, absorptionRateGPerMin: 0 };
  }

  const profile = ABSORPTION_PROFILES[entry.absorption_profile];
  if (!profile) {
    return { absorbedGrams: 0, remainingGrams: 0, absorptionRateGPerMin: 0 };
  }

  const mealTime = new Date(entry.consumed_at).getTime();
  const elapsedMin = (targetTime - mealTime) / 60000;
  const { onsetMin, peakMin, durationMin } = profile;

  if (elapsedMin <= onsetMin) {
    return {
      absorbedGrams: 0,
      remainingGrams: entry.carbs,
      absorptionRateGPerMin: 0,
    };
  }

  if (elapsedMin >= durationMin) {
    return {
      absorbedGrams: entry.carbs,
      remainingGrams: 0,
      absorptionRateGPerMin: 0,
    };
  }

const activeDuration = durationMin - onsetMin;
const progress = (elapsedMin - onsetMin) / activeDuration;
const peakProgress = Math.min(
  0.95,
  Math.max(0.05, (peakMin - onsetMin) / activeDuration)
);

const riseExponent = profile.riseExponent ?? 0.5;
const taperExponent = profile.taperExponent ?? 0.6;

const riseArea = peakProgress / (riseExponent + 1);
const taperArea = (1 - peakProgress) / (taperExponent + 1);
const totalArea = riseArea + taperArea;

let absorbedFraction;
let relativeRate;

if (progress <= peakProgress) {
  const riseProgress = progress / peakProgress;

  relativeRate = riseProgress ** riseExponent;
  absorbedFraction =
    (riseArea * riseProgress ** (riseExponent + 1)) / totalArea;
} else {
  const taperProgress = (progress - peakProgress) / (1 - peakProgress);

  relativeRate = (1 - taperProgress) ** taperExponent;
  absorbedFraction =
    (riseArea +
      taperArea * (1 - (1 - taperProgress) ** (taperExponent + 1))) /
    totalArea;
}

const safeFraction = Math.max(0, Math.min(1, absorbedFraction));
const absorbedGrams = entry.carbs * safeFraction;

return {
  absorbedGrams,
  remainingGrams: entry.carbs - absorbedGrams,
  absorptionRateGPerMin: Math.max(
    0,
    (entry.carbs * relativeRate) / (activeDuration * totalArea)
  ),
  relativeRate,
};
}

export function generateCarbCurve(entry) {
  if (entry.is_custom || !entry.absorption_profile) return [];

  const profile = ABSORPTION_PROFILES[entry.absorption_profile];
  if (!profile) return [];

  const start = new Date(entry.consumed_at).getTime();
  const end = start + profile.durationMin * 60000;
  const step = 3 * 60000;
  const result = [];
for (let time = start; time <= end; time += step) {
  const absorption = getCarbAbsorptionAt(entry, time);
  const activeDuration = profile.durationMin - profile.onsetMin;
  const peakRateGPerMin = entry.carbs * (2 / activeDuration);

  const activity = peakRateGPerMin > 0
    ? absorption.absorptionRateGPerMin / peakRateGPerMin
    : 0;

  result.push({
    time,
    activity: absorption.relativeRate,
    absorbedFraction: entry.carbs > 0
      ? absorption.absorbedGrams / entry.carbs
      : 0,
    remainingFraction: entry.carbs > 0
      ? absorption.remainingGrams / entry.carbs
      : 0,
    ...absorption,
  });
}

  return result;
}

export function getActiveCarbsNow(entries) {
  return entries.reduce(
    (sum, entry) => sum + getCarbAbsorptionAt(entry).remainingGrams,
    0
  );
}

/** Sum of all carbs consumed today */
export function getTotalCarbsToday(entries) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return entries
    .filter((e) => new Date(e.consumed_at) >= today)
    .reduce((sum, e) => sum + e.carbs, 0);
}
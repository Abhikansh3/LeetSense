import { prisma, Difficulty } from "../src/index.js";

/** Seeds a handful of well-known problems so the app has data before a sync. */
async function main() {
  const problems = [
    { titleSlug: "two-sum", title: "Two Sum", difficulty: Difficulty.EASY, tags: ["Array", "Hash Table"] },
    { titleSlug: "add-two-numbers", title: "Add Two Numbers", difficulty: Difficulty.MEDIUM, tags: ["Linked List", "Math"] },
    { titleSlug: "median-of-two-sorted-arrays", title: "Median of Two Sorted Arrays", difficulty: Difficulty.HARD, tags: ["Array", "Binary Search", "Divide and Conquer"] },
  ];

  for (const p of problems) {
    await prisma.problem.upsert({
      where: { titleSlug: p.titleSlug },
      update: {},
      create: p,
    });
  }

  console.log(`Seeded ${problems.length} problems.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

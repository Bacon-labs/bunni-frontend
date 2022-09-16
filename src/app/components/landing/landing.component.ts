import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements OnInit {

  faqItems = [
    {
      question: "How does Timeless work?",
      answer: "Timeless is a yield market protocol. You can provide assets to Timeless (e.g. 100 USDC) and mint PYT and NYT (e.g. 100 PYT and 100 NYT). The assets will be deposited into a farm, and the yield earned can be claimed by the PYT holders. By holding either only PYT or only NYT, you can build either a long position or short position on yield rates."
    },
    {
      question: "How does yield boosting work?",
      answer: "When you use the yield boosting feature, you're essentially buying xPYT on the market. Since xPYT trade at a discount to the underlying asset, you'd be earning a higher yield rate than if you directly deposited your money into the farm. For instance, if you buy 1 xPYT for 0.75 USDC, you would earn the yield produced by 1 USDC, so you'd be earning yield with a 1 / 0.75 = 1.33x multiplier. Holding PYT instead of xPYT works in the same way."
    },
    {
      question: "What are the risks of yield boosting?",
      answer: "Since yield boosting requires holding xPYT, your position is exposed to changes in the future yield rate. This could be desirable or undesirable depending on your beliefs. You would profit if yield rates go up, but suffer a loss if yield rates go down."
    },
    {
      question: "How does yield hedging work?",
      answer: "Suppose you have a yield-earning position somewhere (e.g. Aave) and you're worried that the yield rates might go down in the future. You can hedge against this risk by converting part of your portfolio into NYT. When the yield rate goes down, the price of NYT goes up, increasing your position's effective yield rate."
    },
    {
      question: "What are the risks of yield hedging?",
      answer: "When yield rates go up, your NYT will go down in value. This means yield hedging stablizes your yield rate in both directions, setting both a lower bound and upper bound on your effective yield rate."
    },
    {
      question: "How do I price PYT & NYT based on the yield rate?",
      answer: "Please read https://docs.timelessfi.com/docs/concepts/pyt to learn more."
    },
    {
      question: "What happens to my unclaimed yield when I transfer PYT?",
      answer: "When you transfer your PYT, the unclaimed yield is automatically credited to your account, so you don't have to worry about losing your yield when you transfer PYT. Do note that you still need to claim the yield."
    },
    {
      question: "Should I hold PYT or xPYT?",
      answer: "Either option is valid. If you hold PYT, you need to manually claim the yield, but the yield is stored as the underlying asset making it stable. If you hold xPYT, you don't need to manually claim the yield, but the yield is converted to PYT which is exposed to future yield rate changes making it less stable."
    },
    {
      question: "I want to deploy PYT/NYT/xPYT for a farm. Can I do that?",
      answer: "Yes! Timeless is a permissionless protocol, meaning anyone can deploy PYT, NYT, and xPYT for any compatible farm. We currently support all Yearn v2 and ERC-4626 vaults. We will have a guide on how to do it soon."
    },
    {
      question: "How do I provide liquidity for Timeless yield tokens?",
      answer: "Please check out our guide at https://docs.timelessfi.com/docs/guides/lp"
    }
  ];

  constructor() { }

  ngOnInit(): void {
  }

}

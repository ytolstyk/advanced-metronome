import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { DONATION_LINKS } from "@/constants"

export function DonationModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="donation-trigger">
          <Heart className="h-3.5 w-3.5" />
          Support
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500" />
            Support this project
          </DialogTitle>
          <DialogDescription>
            If you find this tool useful, consider buying me a coffee. It helps
            me keep building free tools.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <a href={DONATION_LINKS.paypal} target="_blank" rel="noopener noreferrer">
            <Button className="w-full donation-btn paypal-btn" size="lg">
              <img
                src="https://www.paypalobjects.com/webstatic/icon/pp258.png"
                alt="PayPal"
                className="h-5 w-5"
              />
              Donate with PayPal
            </Button>
          </a>
          <a href={DONATION_LINKS.venmo} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full donation-btn venmo-btn" size="lg">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current text-[#008CFF]">
                <path d="M19.227 2c.68 1.132.989 2.295.989 3.773 0 4.699-4.012 10.796-7.278 15.08H5.817L3 3.967l6.07-.58 1.512 12.255c1.41-2.294 3.152-5.9 3.152-8.354 0-1.345-.231-2.264-.594-3.028L19.227 2z" />
              </svg>
              Donate with Venmo
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

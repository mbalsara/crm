import { Link, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  AlertTriangle,
  Building2,
  Settings,
  Mail,
  PanelLeftClose,
  PanelLeft,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Escalations", href: "/escalations", icon: AlertTriangle },
  { name: "Customers", href: "/customers", icon: Building2 },
  { name: "Users", href: "/users", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
]

interface AppSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const { pathname } = useLocation()

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!collapsed && (
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Mail className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">Email Intelligence</span>
                <span className="text-xs text-muted-foreground">Customer Insights</span>
              </div>
            </Link>
          )}
          {collapsed && (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary mx-auto">
              <Mail className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const NavItem = (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    collapsed && "justify-center px-2",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              )

              if (collapsed) {
                return (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>{NavItem}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return NavItem
            })}
          </nav>
        </ScrollArea>

        <div className="border-t border-border p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className={cn("w-full", collapsed ? "px-2" : "justify-start")}
              >
                {collapsed ? (
                  <PanelLeft className="h-5 w-5" />
                ) : (
                  <>
                    <PanelLeftClose className="mr-2 h-5 w-5" />
                    Collapse
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Expand sidebar</TooltipContent>}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
